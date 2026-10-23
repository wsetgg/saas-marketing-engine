const ALLOWED_ACTIONS = new Set(["generation", "research"]);

export async function consumeRateLimit({ userId, action, limit, windowSeconds = 3600 }) {
  if (!userId || !ALLOWED_ACTIONS.has(action) || !Number.isInteger(limit) || limit < 1 ||
      !Number.isInteger(windowSeconds) || windowSeconds < 1) {
    throw new Error("Invalid rate limit request.");
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Persistent rate limiting is not configured.");

  const response = await fetch(url.replace(/\/$/, "") + "/rest/v1/rpc/consume_ai_usage_limit", {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: "Bearer " + serviceKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_user_id: userId,
      p_action: action,
      p_limit: limit,
      p_window_seconds: windowSeconds
    }),
    signal: AbortSignal.timeout(7000)
  });

  if (!response.ok) {
    throw new Error("Persistent rate limit request failed (" + response.status + ").");
  }

  const result = await response.json();
  const row = Array.isArray(result) ? result[0] : result;
  if (typeof row?.allowed !== "boolean") throw new Error("Persistent rate limit returned an invalid response.");
  return row.allowed;
}
