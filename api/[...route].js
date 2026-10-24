import configHandler from "../lib/routes/config.js";
import experimentsHandler from "../lib/routes/experiments.js";
import propertiesHandler from "../lib/routes/ga4-properties.js";
import reportHandler from "../lib/routes/ga4-report.js";

const handlers = {
  config: configHandler,
  experiments: experimentsHandler,
  "ga4-properties": propertiesHandler,
  "ga4-report": reportHandler
};

export default async function handler(req, res) {
  const route = Array.isArray(req.query?.route) ? req.query.route[0] : req.query?.route;
  const selected = handlers[String(route || "")];
  if (!selected) return res.status(404).json({ error: "API route not found." });
  return selected(req, res);
}
