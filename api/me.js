import { getAuthenticatedUser } from "../lib/auth.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const auth = await getAuthenticatedUser(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const devEmails = (process.env.DEV_ACCESS_EMAILS || "")
    .split(",")
    .map(x => x.trim().toLowerCase())
    .filter(Boolean);
  const isDeveloper = devEmails.includes(auth.user.email.toLowerCase());

  // Let the configured owner/developer access the app without a subscription
  // database lookup. This keeps development access independent of billing setup.
  if (isDeveloper) {
    return res.status(200).json({
      email: auth.user.email,
      hasAccess: true,
      developerAccess: true,
      subscriptionStatus: "developer",
      currentPeriodEnd: null
    });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    return res.status(503).json({ error: "Subscription storage is not configured yet." });
  }

  try {
    const query = new URLSearchParams({
      select: "status,current_period_end",
      user_id: "eq." + auth.user.id,
      limit: "1"
    });
    const response = await fetch(url.replace(/\/$/, "") + "/rest/v1/subscriptions?" + query.toString(), {
      headers: { apikey: key, Authorization: "Bearer " + auth.accessToken },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      const details = (await response.text()).slice(0, 400);
      console.error("Subscription lookup failed:", response.status, details);
      return res.status(502).json({ error: "Could not check subscription status. Please try again." });
    }

    const rows = await response.json();
    const subscription = rows[0] || null;
    const periodEnd = subscription?.current_period_end ? Date.parse(subscription.current_period_end) : 0;
    const paidStatus = ["active", "trialing"].includes(subscription?.status) ||
      (subscription?.status === "canceled" && periodEnd > Date.now());

    return res.status(200).json({
      email: auth.user.email,
      hasAccess: paidStatus,
      developerAccess: false,
      subscriptionStatus: subscription?.status || "inactive",
      currentPeriodEnd: subscription?.current_period_end || null
    });
  } catch (error) {
    console.error("Subscription lookup error:", error?.name || "Error", error?.message || "Unknown error");
    return res.status(502).json({ error: "Could not check subscription status. Please try again." });
  }
}
