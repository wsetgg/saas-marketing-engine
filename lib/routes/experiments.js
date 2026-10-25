import { dbRequest, getAuthenticatedUser, workspaceAccess } from "../ga4.js";

function clean(value, max) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  const auth = await getAuthenticatedUser(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  let hasAccess;
  try { hasAccess = await workspaceAccess(auth); }
  catch (error) { return res.status(502).json({ error: error.message }); }
  if (!hasAccess) return res.status(403).json({ error: "An active Growthdesk subscription is required for acquisition analytics." });
  const userId = auth.user.id;
  if (req.method === "GET") {
    try {
      const rows = await dbRequest("growth_experiments?select=id,title,channel,hypothesis,metric,baseline_value,target_value,result_value,status,notes,created_at,updated_at&user_id=eq." + encodeURIComponent(userId) + "&order=created_at.desc&limit=100");
      return res.status(200).json({ experiments: rows || [] });
    } catch (error) {
      return res.status(502).json({ error: error.message });
    }
  }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body || typeof body !== "object" || Array.isArray(body)) return res.status(400).json({ error: "Submit a valid experiment." });

  if (req.method === "POST") {
    const title = clean(body.title, 180);
    const channel = clean(body.channel, 40);
    const hypothesis = clean(body.hypothesis, 3000);
    const metric = clean(body.metric, 100);
    const status = ["Planned", "Running", "Completed", "Paused"].includes(body.status) ? body.status : "Planned";
    if (!title || !hypothesis || !metric) return res.status(400).json({ error: "Title, hypothesis, and success metric are required." });
    const numberOrNull = value => value === "" || value == null ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
    const row = {
      user_id: userId, title, channel, hypothesis, metric, status,
      baseline_value: numberOrNull(body.baselineValue),
      target_value: numberOrNull(body.targetValue),
      result_value: numberOrNull(body.resultValue),
      notes: clean(body.notes, 4000),
      updated_at: new Date().toISOString()
    };
    try {
      const rows = await dbRequest("growth_experiments", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(row)
      });
      return res.status(201).json({ experiment: rows?.[0] });
    } catch (error) {
      return res.status(502).json({ error: error.message });
    }
  }

  if (req.method === "PATCH") {
    const id = clean(body.id, 50);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: "Choose a valid experiment." });
    const allowed = {};
    if (typeof body.status === "string" && ["Planned", "Running", "Completed", "Paused"].includes(body.status)) allowed.status = body.status;
    if (typeof body.notes === "string") allowed.notes = clean(body.notes, 4000);
    if (body.resultValue !== undefined) {
      if (body.resultValue !== null && body.resultValue !== "" && !Number.isFinite(Number(body.resultValue))) return res.status(400).json({ error: "Result must be a number." });
      allowed.result_value = body.resultValue === "" || body.resultValue === null ? null : Number(body.resultValue);
    }
    if (!Object.keys(allowed).length) return res.status(400).json({ error: "No valid changes supplied." });
    allowed.updated_at = new Date().toISOString();
    try {
      const rows = await dbRequest("growth_experiments?id=eq." + encodeURIComponent(id) + "&user_id=eq." + encodeURIComponent(userId), {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(allowed)
      });
      if (!rows?.length) return res.status(404).json({ error: "Experiment not found." });
      return res.status(200).json({ experiment: rows[0] });
    } catch (error) {
      return res.status(502).json({ error: error.message });
    }
  }
  res.setHeader("Allow", "GET, POST, PATCH");
  return res.status(405).json({ error: "Method not allowed." });
}
