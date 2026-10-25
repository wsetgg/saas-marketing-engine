import { dbRequest, decryptToken, exchangeRefreshToken, getAuthenticatedUser, getConnection, googleGet, workspaceAccess } from "../ga4.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const auth = await getAuthenticatedUser(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  let hasAccess;
  try { hasAccess = await workspaceAccess(auth); }
  catch (error) { return res.status(502).json({ error: error.message }); }
  if (!hasAccess) return res.status(403).json({ error: "An active Growthdesk subscription is required for acquisition analytics." });
  try {
    if (req.method === "GET") {
      const connection = await getConnection(auth.user.id);
      if (!connection) return res.status(200).json({ connected: false, properties: [] });
      const access = await exchangeRefreshToken(decryptToken(connection.encrypted_refresh_token));
      const result = await googleGet("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", access);
      const properties = (result.accountSummaries || []).flatMap(account =>
        (account.propertySummaries || []).map(property => ({
          propertyId: String(property.property || "").replace(/^properties\//, ""),
          displayName: String(property.displayName || "Unnamed property").slice(0, 200),
          accountName: String(account.displayName || "").slice(0, 200)
        })).filter(x => /^\d+$/.test(x.propertyId))
      );
      return res.status(200).json({
        connected: true,
        connectedEmail: connection.connected_email,
        selectedPropertyId: connection.property_id,
        properties
      });
    }
    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
      const propertyId = String(body?.propertyId || "").trim();
      if (!/^\d{4,30}$/.test(propertyId)) return res.status(400).json({ error: "Choose a valid Google Analytics property." });
      const connection = await getConnection(auth.user.id);
      if (!connection) return res.status(400).json({ error: "Connect Google Analytics first." });
      const access = await exchangeRefreshToken(decryptToken(connection.encrypted_refresh_token));
      const response = await googleGet("https://analyticsadmin.googleapis.com/v1beta/properties/" + propertyId, access);
      const name = String(response.displayName || "Google Analytics property").slice(0, 200);
      await dbRequest("ga4_connections?user_id=eq." + encodeURIComponent(auth.user.id), {
        method: "PATCH",
        body: JSON.stringify({ property_id: propertyId, property_name: name, updated_at: new Date().toISOString() })
      });
      return res.status(200).json({ selected: true, propertyId, propertyName: name });
    }
    if (req.method === "DELETE") {
      await dbRequest("ga4_connections?user_id=eq." + encodeURIComponent(auth.user.id), { method: "DELETE" });
      return res.status(200).json({ disconnected: true });
    }
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    console.error("GA4 properties request failed", error.message);
    return res.status(502).json({ error: error.message || "Could not load Google Analytics properties." });
  }
}
