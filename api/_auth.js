export async function getAuthenticatedUser(req) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return { error: "Please sign in to continue.", status: 401 };

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return { error: "Account setup is not configured yet.", status: 503 };

  try {
    const response = await fetch(url.replace(/\/$/, "") + "/auth/v1/user", {
      headers: { apikey: key, Authorization: "Bearer " + match[1] },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return { error: "Your session expired. Please sign in again.", status: 401 };
    const user = await response.json();
    if (!user?.id || !user?.email) return { error: "Please sign in to continue.", status: 401 };
    return { user, accessToken: match[1] };
  } catch {
    return { error: "Could not verify your session. Please try again.", status: 502 };
  }
}

export async function upsertSubscription(row) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing.");
  const response = await fetch(url.replace(/\/$/, "") + "/rest/v1/subscriptions?on_conflict=user_id", {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error("Could not update subscription record.");
}
