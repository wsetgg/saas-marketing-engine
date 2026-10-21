# SaaS Marketing Research Studio

An early internal tool for researching small B2B SaaS products and turning supplied customer evidence into a practical marketing research brief.

## Current MVP

- Collects product details, suspected audience, competitor context, and public customer evidence.
- Uses Claude Haiku through a server-side Vercel function to organize evidence, identify hypotheses, and suggest marketing experiments.
- Explicitly tells the model not to claim it browsed or verified source URLs.
- Keeps the Anthropic API key on the server. The key must never be committed to GitHub or placed in browser code.

## Important limitation

This version does **not** automatically browse websites or fetch source URLs. Paste relevant public excerpts and include their URLs/dates in the evidence field. Verify sources yourself before using the report for client work. Automatic source collection should be added only after the research workflow is useful and reliable.

## Run locally

1. Install Node.js and the Vercel CLI.
2. Run `npm install` only if you need local tooling; the endpoint uses built-in fetch and has no runtime dependencies.
3. Set `ANTHROPIC_API_KEY` in your local environment or Vercel environment settings. Never put the actual key in a committed file.
4. Run `npx vercel dev`.

## Deploy

Import this repository into Vercel and add the environment variable `ANTHROPIC_API_KEY` in Project Settings → Environment Variables. Redeploy after adding or changing the variable.

## Cost and privacy notes

- The endpoint uses a small Haiku model and caps output at 1,800 tokens.
- Every successful request may incur Anthropic API charges.
- Do not submit private customer data, credentials, or confidential client material.
- This prototype has no authentication or per-user rate limiting. Keep deployment private or restrict access before using it with real client information or sharing it publicly.
