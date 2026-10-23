import { randomBytes } from "node:crypto";
import { getAuthenticatedUser, signState, redirectUri, workspaceAccess } from "../lib/ga4.js";

function setCookie(res, name, value) {
  res.setHeader("Set-Cookie", name + "=" + encodeURIComponent(value) + "; HttpOnly; Secure; SameSite=Lax; Path=/api/ga4-callback; Max-Age=600");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const auth = await getAuthenticatedUser(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  let hasAccess;
  try { hasAccess = await workspaceAccess(auth); }
  catch (error) { return res.status(502).json({ error: error.message }); }
  if (!hasAccess) return res.status(403).json({ error: "An active Growthdesk subscription is required for acquisition analytics." });
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET ||
      !process.env.GA4_OAUTH_STATE_SECRET || !process.env.GA4_TOKEN_ENCRYPTION_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.APP_URL) {
    return res.status(503).json({ error: "Google Analytics connection is not configured yet. See the setup instructions in README.md." });
  }
  try {
    const nonce = randomBytes(24).toString("base64url");
    setCookie(res, "growthdesk_ga4_nonce", nonce);
    const state = signState({ uid: auth.user.id, nonce, exp: Date.now() + 10 * 60 * 1000 });
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: "https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/analytics.account.readonly",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state
    });
    return res.status(200).json({ authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString() });
  } catch (error) {
    console.error("GA4 OAuth initiation failed", error.message);
    return res.status(503).json({ error: "Could not start Google Analytics authorization." });
  }
}
