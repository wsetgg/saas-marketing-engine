import { decryptToken, exchangeRefreshToken, getAuthenticatedUser, getConnection, googleGet, workspaceAccess } from "../lib/ga4.js";

function dateDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function parseReport(report) {
  return (report.rows || []).map(row => ({
    channel: row.dimensionValues?.[0]?.value || "(not set)",
    sessions: Number(row.metricValues?.[0]?.value || 0),
    users: Number(row.metricValues?.[1]?.value || 0),
    keyEvents: Number(row.metricValues?.[2]?.value || 0)
  }));
}
async function runReport(propertyId, access, startDate, endDate) {
  return googleGet("https://analyticsdata.googleapis.com/v1beta/properties/" + propertyId + ":runReport", access).catch(async () => {
    const response = await fetch("https://analyticsdata.googleapis.com/v1beta/properties/" + propertyId + ":runReport", {
      method: "POST",
      headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "keyEvents" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: "15"
      }),
      signal: AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("GA4 report failed", response.status, data.error?.status || "unknown");
      throw new Error("Could not load GA4 report. Confirm the selected property and configured GA4 events.");
    }
    return data;
  });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
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
  try {
    const connection = await getConnection(auth.user.id);
    if (!connection?.property_id) return res.status(400).json({ error: "Connect Google Analytics and select a property first." });
    const access = await exchangeRefreshToken(decryptToken(connection.encrypted_refresh_token));
    const startDate = dateDaysAgo(27);
    const endDate = dateDaysAgo(1);
    const previousStart = dateDaysAgo(55);
    const previousEnd = dateDaysAgo(28);
    const [current, previous, pages] = await Promise.all([
      runReport(connection.property_id, access, startDate, endDate),
      runReport(connection.property_id, access, previousStart, previousEnd),
      fetch("https://analyticsdata.googleapis.com/v1beta/properties/" + connection.property_id + ":runReport", {
        method: "POST",
        headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: "landingPagePlusQueryString" }],
          metrics: [{ name: "sessions" }, { name: "keyEvents" }],
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
          limit: "10"
        }),
        signal: AbortSignal.timeout(15000)
      }).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error("Could not load landing pages report."); return d; })
    ]);
    const previousMap = Object.fromEntries(parseReport(previous).map(row => [row.channel, row]));
    const channels = parseReport(current).map(row => ({
      ...row,
      previousSessions: previousMap[row.channel]?.sessions || 0,
      sessionsChange: row.sessions - (previousMap[row.channel]?.sessions || 0)
    }));
    const totalSessions = channels.reduce((sum, row) => sum + row.sessions, 0);
    const totalUsers = channels.reduce((sum, row) => sum + row.users, 0);
    const totalKeyEvents = channels.reduce((sum, row) => sum + row.keyEvents, 0);
    const priorSessions = channels.reduce((sum, row) => sum + row.previousSessions, 0);
    const landingPages = (pages.rows || []).map(row => ({
      page: row.dimensionValues?.[0]?.value || "(not set)",
      sessions: Number(row.metricValues?.[0]?.value || 0),
      keyEvents: Number(row.metricValues?.[1]?.value || 0)
    }));
    return res.status(200).json({
      propertyName: connection.property_name,
      connectedEmail: connection.connected_email,
      period: { startDate, endDate, previousStart, previousEnd },
      summary: {
        sessions: totalSessions,
        users: totalUsers,
        keyEvents: totalKeyEvents,
        previousSessions: priorSessions,
        sessionsChangePercent: priorSessions ? Math.round((totalSessions - priorSessions) / priorSessions * 1000) / 10 : null
      },
      channels,
      landingPages,
      note: "Key events are whatever this GA4 property has configured. They are not necessarily sign-ups. Mark a real sign-up event as a key event in GA4 to measure sign-ups."
    });
  } catch (error) {
    console.error("GA4 report endpoint failed", error.message);
    return res.status(502).json({ error: error.message || "Could not load acquisition report." });
  }
}
