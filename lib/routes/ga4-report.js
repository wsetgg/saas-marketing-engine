import { decryptToken, exchangeRefreshToken, getAuthenticatedUser, getConnection, googleGet, workspaceAccess } from "../ga4.js";

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
async function runTrendReport(propertyId, access, startDate, endDate) {
  const response = await fetch("https://analyticsdata.googleapis.com/v1beta/properties/" + encodeURIComponent(propertyId) + ":runReport", {
    method: "POST",
    headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      keepEmptyRows: true,
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "keyEvents" }],
      orderBys: [{ dimension: { dimensionName: "date" }, desc: false }],
      limit: "35"
    }),
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("GA4 trend report failed", response.status, data.error?.status || "unknown", data.error?.message || "no message", "property", propertyId);
    throw new Error("Could not load the GA4 traffic trend. Confirm the selected property has report access.");
  }
  return (data.rows || []).map(row => {
    const date = row.dimensionValues?.[0]?.value || "";
    return { date, dateLabel: date.length === 8 ? date.slice(4,6) + "/" + date.slice(6,8) : date, sessions: Number(row.metricValues?.[0]?.value || 0), users: Number(row.metricValues?.[1]?.value || 0), keyEvents: Number(row.metricValues?.[2]?.value || 0) };
  });
}

async function runReport(propertyId, access, startDate, endDate) {
  const response = await fetch("https://analyticsdata.googleapis.com/v1beta/properties/" + encodeURIComponent(propertyId) + ":runReport", {
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
    console.error("GA4 report failed", response.status, data.error?.status || "unknown", data.error?.message || "no message", "property", propertyId);
    throw new Error("Could not load GA4 report. Confirm the selected property is a GA4 property and that your Google account has Viewer access.");
  }
  return data;
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
    const [current, previous, pages, dailyTrend] = await Promise.all([
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
      }).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) { console.error("GA4 landing-page report failed", r.status, d.error?.status || "unknown", d.error?.message || "no message", "property", connection.property_id); throw new Error("Could not load landing pages report. " + (d.error?.message || "Check that the Analytics Data API is enabled and this account can access the selected GA4 property.")); } return d; })
      ,runTrendReport(connection.property_id, access, startDate, endDate)
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
      dailyTrend,
      note: "Key events are whatever this GA4 property has configured. They are not necessarily sign-ups. Mark a real sign-up event as a key event in GA4 to measure sign-ups."
    });
  } catch (error) {
    console.error("GA4 report endpoint failed", error.message);
    return res.status(502).json({ error: error.message || "Could not load acquisition report." });
  }
}
