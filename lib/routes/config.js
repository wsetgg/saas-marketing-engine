export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Login config missing SUPABASE_URL or SUPABASE_ANON_KEY");
    return res.status(503).json({ error: "Account setup is not configured yet. Please try again later." });
  }
  try {
    new URL(supabaseUrl);
  } catch {
    console.error("Login config has an invalid SUPABASE_URL");
    return res.status(503).json({ error: "Account setup has an invalid Supabase URL. Please check the Vercel environment variable." });
  }
  return res.status(200).json({ supabaseUrl, supabaseAnonKey });
}
