const loaders = {
  config: () => import("../lib/routes/config.js"),
  experiments: () => import("../lib/routes/experiments.js"),
  "ga4-properties": () => import("../lib/routes/ga4-properties.js"),
  "ga4-report": () => import("../lib/routes/ga4-report.js")
};

export default async function handler(req, res) {
  const route = Array.isArray(req.query?.route) ? req.query.route[0] : req.query?.route;
  const load = loaders[String(route || "")];
  if (!load) return res.status(404).json({ error: "API route not found." });

  try {
    const module = await load();
    return await module.default(req, res);
  } catch (error) {
    console.error("API route failed to load", String(route || ""), error);
    return res.status(500).json({ error: "The requested API route failed to initialize." });
  }
}
