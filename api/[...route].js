import configHandler from "../lib/routes/config.js";
import experimentsHandler from "../lib/routes/experiments.js";
import ga4PropertiesHandler from "../lib/routes/ga4-properties.js";
import ga4ReportHandler from "../lib/routes/ga4-report.js";

const handlers = {
  config: configHandler,
  experiments: experimentsHandler,
  "ga4-properties": ga4PropertiesHandler,
  "ga4-report": ga4ReportHandler
};

function getRoute(req) {
  const queryRoute = req.query?.route;
  if (Array.isArray(queryRoute) && queryRoute.length) return queryRoute[0];
  if (typeof queryRoute === "string" && queryRoute) return queryRoute.split("/")[0];

  const pathname = String(req.url || "").split("?")[0];
  const match = pathname.match(/^\/api\/(.+)$/);
  return match ? decodeURIComponent(match[1]).split("/")[0] : "";
}

export default async function handler(req, res) {
  const route = getRoute(req);
  const handler = handlers[route];
  if (!handler) return res.status(404).json({ error: "API route not found.", route: route || null });

  try {
    return await handler(req, res);
  } catch (error) {
    console.error("API route failed", route, error);
    return res.status(500).json({ error: "The requested API route failed to initialize." });
  }
}
