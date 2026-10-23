import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getAuthenticatedUser } from "./auth.js";

export { getAuthenticatedUser };

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(name + " is not configured.");
  return value;
}

export function supabaseConfig() {
  return {
    url: required("SUPABASE_URL").replace(/\/$/, ""),
    key: required("SUPABASE_SERVICE_ROLE_KEY")
  };
}

export async function dbRequest(path, options = {}) {
  const { url, key } = supabaseConfig();
  const response = await fetch(url + "/rest/v1/" + path, {
    ...options,
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    signal: options.signal || AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    console.error("GA4 storage request failed", response.status, detail);
    throw new Error("Could not access Growthdesk's analytics storage.");
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function encryptionKey() {
  const raw = required("GA4_TOKEN_ENCRYPTION_KEY");
  let key;
  try {
    key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  } catch { key = Buffer.alloc(0); }
  if (key.length !== 32) throw new Error("GA4_TOKEN_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hex characters or base64.");
  return key;
}

export function encryptToken(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptToken(value) {
  const [ivText, tagText, dataText] = String(value || "").split(".");
  if (!ivText || !tagText || !dataText) throw new Error("Stored analytics token is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]).toString("utf8");
}

export function signState(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", required("GA4_OAUTH_STATE_SECRET")).update(data).digest("base64url");
  return data + "." + signature;
}

export function verifyState(state) {
  const [data, signature, extra] = String(state || "").split(".");
  if (!data || !signature || extra) throw new Error("Invalid OAuth state.");
  const expected = createHmac("sha256", required("GA4_OAUTH_STATE_SECRET")).update(data).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new Error("Invalid OAuth state signature.");
  const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  if (!payload.uid || !payload.nonce || !Number.isFinite(payload.exp) || payload.exp < Date.now()) throw new Error("OAuth session expired. Please reconnect.");
  return payload;
}

export function redirectUri() {
  const base = required("APP_URL").replace(/\/$/, "");
  return base + "/api/ga4-callback";
}

export async function exchangeRefreshToken(refreshToken) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: required("GOOGLE_CLIENT_ID"),
      client_secret: required("GOOGLE_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    }),
    signal: AbortSignal.timeout(10000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    console.error("Google token refresh failed", response.status, body.error || "unknown");
    throw new Error("Google authorization expired or was revoked. Reconnect Google Analytics.");
  }
  return body.access_token;
}

export async function getConnection(userId) {
  const rows = await dbRequest("ga4_connections?select=user_id,encrypted_refresh_token,property_id,property_name,connected_email,created_at&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
  return rows?.[0] || null;
}

export async function googleGet(url, accessToken) {
  const response = await fetch(url, {
    headers: { Authorization: "Bearer " + accessToken },
    signal: AbortSignal.timeout(12000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Google Analytics request failed", response.status, body.error?.status || "unknown");
    throw new Error(response.status === 401 ? "Google authorization expired. Reconnect Google Analytics." : "Google Analytics could not return this report.");
  }
  return body;
}
