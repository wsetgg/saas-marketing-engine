const loaders = {
  config: () => import("../lib/routes/config.js"),
  experiments: () => import("../lib/routes/experiments.js"),
  "ga4-properties": () => import("../lib/routes/ga4-properties.js"),
  "ga4-report": () => import("../lib/routes/ga4-report.js")
};

function getRoute(req) {
  const queryRoute = req.query?.route;
  if (Array.isArray(queryRoute) && queryRoute.length) return queryRoute[0];
  if (typeof queryRoute === "string" && queryRoute) return queryRoute.split("/")[0];

  // Vercel's catch-all query can be absent depending on routing/config.
  // Fall back to the URL path so /api/config reliably resolves to "config".
  const pathname = String(req.url || "").split("?")[0];
  const match = pathname.match(/^\/api\/(.+)$/);
  return match ? decodeURIComponent(match[1]).split("/")[0] : "";
}

export default async function handler(req, res) {
  const route = getRoute(req);
  const load = loaders[route];
  if (!load) return res.status(404).json({ error: "API route not found.", route: route || null });

  try {
    const module = await load();
    return await module.default(req, res);
  } catch (error) {
    console.error("API route failed to load", route, error);
    return res.status(500).json({ error: "The requested API route failed to initialize." });
  }
}
