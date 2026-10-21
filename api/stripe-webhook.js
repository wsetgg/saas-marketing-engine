import { createHmac, timingSafeEqual } from "node:crypto";
import { upsertSubscription } from "./_auth.js";

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function verifySignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const parts = header.split(",").map(part => part.trim());
  const timestamp = parts.find(part => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter(part => part.startsWith("v1=")).map(part => part.slice(3));
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(timestamp + ".").update(rawBody).digest("hex");
  return signatures.some(signature => {
    try {
      const a = Buffer.from(signature, "hex");
      const b = Buffer.from(expected, "hex");
      return a.length === b.length && timingSafeEqual(a, b);
    } catch { return false; }
  });
}

async function getStripeSubscription(subscriptionId) {
  const response = await fetch("https://api.stripe.com/v1/subscriptions/" + encodeURIComponent(subscriptionId), {
    headers: { Authorization: "Bearer " + process.env.STRIPE_SECRET_KEY },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error("Could not retrieve subscription.");
  return response.json();
}

function isoPeriodEnd(unixSeconds) {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method not allowed.");
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!secret || !stripeKey) return res.status(503).send("Webhook is not configured.");
  let rawBody;
  try { rawBody = await readRawBody(req); } catch { return res.status(400).send("Invalid body."); }
  if (!verifySignature(rawBody, req.headers["stripe-signature"], secret)) {
    return res.status(400).send("Invalid webhook signature.");
  }

  let event;
  try { event = JSON.parse(rawBody.toString("utf8")); } catch { return res.status(400).send("Invalid event JSON."); }

  try {
    const object = event.data?.object || {};
    if (event.type === "checkout.session.completed" && object.mode === "subscription" && object.subscription && object.client_reference_id) {
      const subscription = await getStripeSubscription(object.subscription);
      await upsertSubscription({
        user_id: object.client_reference_id,
        stripe_customer_id: typeof object.customer === "string" ? object.customer : object.customer?.id,
        stripe_subscription_id: subscription.id,
        status: subscription.status,
        current_period_end: isoPeriodEnd(subscription.current_period_end)
      });
    } else if (event.type?.startsWith("customer.subscription.") && object.id && object.metadata?.user_id) {
      await upsertSubscription({
        user_id: object.metadata.user_id,
        stripe_customer_id: typeof object.customer === "string" ? object.customer : object.customer?.id,
        stripe_subscription_id: object.id,
        status: object.status,
        current_period_end: isoPeriodEnd(object.current_period_end)
      });
    } else if (event.type === "invoice.payment_failed" && object.subscription) {
      const subscription = await getStripeSubscription(object.subscription);
      const userId = subscription.metadata?.user_id;
      if (userId) {
        await upsertSubscription({
          user_id: userId,
          stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id,
          stripe_subscription_id: subscription.id,
          status: subscription.status,
          current_period_end: isoPeriodEnd(subscription.current_period_end)
        });
      }
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed", error?.message || "unknown error");
    return res.status(500).send("Webhook processing failed.");
  }
}
