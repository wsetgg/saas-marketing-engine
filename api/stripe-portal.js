import { getAuthenticatedUser } from "../lib/auth.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const auth = await getAuthenticatedUser(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const appUrl = process.env.APP_URL;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!stripeKey || !appUrl || !url || !serviceKey) {
    return res.status(503).json({ error: "Billing management is not configured yet." });
  }

  try {
    const query = new URLSearchParams({ select: "stripe_customer_id", user_id: "eq." + auth.user.id, limit: "1" });
    const dbResponse = await fetch(url.replace(/\/$/, "") + "/rest/v1/subscriptions?" + query.toString(), {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
      signal: AbortSignal.timeout(8000)
    });
    if (!dbResponse.ok) throw new Error("Could not find billing record.");
    const rows = await dbResponse.json();
    const customerId = rows[0]?.stripe_customer_id;
    if (!customerId) return res.status(404).json({ error: "No billing account was found for this user." });

    const form = new URLSearchParams();
    form.set("customer", customerId);
    form.set("return_url", appUrl.replace(/\/$/, "") + "/dashboard.html");
    const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: { Authorization: "Bearer " + stripeKey, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(12000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.url) return res.status(502).json({ error: "Could not open billing management." });
    return res.status(200).json({ url: data.url });
  } catch {
    return res.status(502).json({ error: "Could not open billing management. Please try again." });
  }
}
