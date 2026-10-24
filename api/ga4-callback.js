import { createHmac, timingSafeEqual } from "node:crypto";
import { dbRequest, encryptToken, redirectUri, verifyState } from "../lib/ga4.js";

function cookieValue(req, name) {
  const cookie = req.headers.cookie || "";
  const item = cookie.split(";").map(x => x.trim()).find(x => x.startsWith(name + "="));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : "";
}

function clearCookie(res) {
  res.setHeader("Set-Cookie", "growthdesk_ga4_nonce=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const app = (process.env.APP_URL || "").replace(/\/$/, "");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method not allowed.");
  }
  try {
    if (req.query.error) throw new Error("Google authorization was cancelled or denied.");
    const state = verifyState(req.query.state);
    const cookieNonce = cookieValue(req, "growthdesk_ga4_nonce");
    if (!cookieNonce || cookieNonce !== state.nonce) throw new Error("Authorization session did not match. Please try connecting again.");
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!code) throw new Error("Google did not return an authorization code.");
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: redirectUri(),
        grant_type: "authorization_code"
      }),
      signal: AbortSignal.timeout(12000)
    });
    const tokens = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokens.refresh_token) {
      console.error("Google OAuth code exchange failed", tokenResponse.status, tokens.error || "refresh token missing");
      throw new Error("Google did not provide a refresh token. Disconnect Growthdesk in your Google account permissions and try again.");
    }

    const accessResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: "Bearer " + tokens.access_token },
      signal: AbortSignal.timeout(10000)
    });
    const googleUser = await accessResponse.json().catch(() => ({}));
    const row = {
      user_id: state.uid,
      encrypted_refresh_token: encryptToken(tokens.refresh_token),
      property_id: null,
      property_name: null,
      connected_email: typeof googleUser.email === "string" ? googleUser.email.slice(0, 254) : null,
      updated_at: new Date().toISOString()
    };
    await dbRequest("ga4_connections?on_conflict=user_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(row)
    });
    clearCookie(res);
    return res.redirect(302, app + "/acquisition.html?google=connected");
  } catch (error) {
    clearCookie(res);
    const message = encodeURIComponent((error.message || "Could not connect Google Analytics.").slice(0, 180));
    return res.redirect(302, app + "/acquisition.html?google_error=" + message);
  }
}
