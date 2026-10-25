import { getAuthenticatedUser } from "../lib/auth.js";
import { workspaceAccess } from "../lib/ga4.js";
import { getDailyTokenUsage } from "../lib/token-usage.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const auth = await getAuthenticatedUser(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  try {
    if (!(await workspaceAccess(auth))) {
      return res.status(403).json({ error: "An active Growthdesk subscription is required." });
    }
    const usage = await getDailyTokenUsage(auth.user.id);
    return res.status(200).json(usage);
  } catch (error) {
    console.error("Token usage lookup failed", error?.name || "Error");
    return res.status(503).json({ error: "Token usage is not configured yet. Please try again after setup." });
  }
}
