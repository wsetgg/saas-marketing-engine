import { getAuthenticatedUser } from "./_auth.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const auth = await getAuthenticatedUser(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  const appUrl = process.env.APP_URL;
  if (!stripeKey || !priceId || !appUrl) {
    return res.status(503).json({ error: "Checkout is not configured yet. Please try again later." });
  }

  try {
    const form = new URLSearchParams();
    form.set("mode", "subscription");
    form.set("line_items[0][price]", priceId);
    form.set("line_items[0][quantity]", "1");
    form.set("success_url", appUrl.replace(/\/$/, "") + "/dashboard.html?checkout=success");
    form.set("cancel_url", appUrl.replace(/\/$/, "") + "/#pricing");
    form.set("client_reference_id", auth.user.id);
    form.set("customer_email", auth.user.email);
    form.set("metadata[user_id]", auth.user.id);
    form.set("subscription_data[metadata][user_id]", auth.user.id);
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + stripeKey,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form.toString(),
      signal: AbortSignal.timeout(12000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.url) {
      console.error("Stripe checkout error", response.status, data?.error?.type || "unknown");
      return res.status(502).json({ error: "Stripe could not start checkout. Please try again later." });
    }
    return res.status(200).json({ url: data.url });
  } catch {
    return res.status(502).json({ error: "Could not connect to checkout. Please try again." });
  }
}
