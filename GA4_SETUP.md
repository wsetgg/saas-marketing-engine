# Growthdesk acquisition MVP setup

This branch adds an early acquisition analytics workflow: GA4 OAuth connection, property selection, acquisition reports, and a saved experiment tracker. It is not ready for public launch until configured and tested end-to-end.

## 1. Apply the database migration

In Supabase SQL Editor, run the complete file supabase/acquisition_mvp.sql.

The ga4_connections table is server-only and stores refresh tokens encrypted by the application. The growth_experiments table has per-user row-level security.

## 2. Create Google OAuth credentials

1. In Google Cloud Console, create/select a project.
2. Enable Google Analytics Admin API and Google Analytics Data API.
3. Configure the OAuth consent screen with the app name, support email, audience, and privacy policy. Start in Testing mode while developing and add your own Google account as a test user.
4. Create an OAuth client ID of type Web application.
5. Add this exact Authorized redirect URI: https://YOUR-DOMAIN/api/ga4-callback (replace YOUR-DOMAIN with the deployed Growthdesk domain).
6. The requested scopes are read-only: analytics.readonly and analytics.account.readonly. Google may require verification before broad public distribution.

## 3. Add Vercel environment variables

Add these to the same Vercel project and environment as the deployment:

- GOOGLE_CLIENT_ID — OAuth client ID.
- GOOGLE_CLIENT_SECRET — OAuth client secret (server-only).
- GA4_OAUTH_STATE_SECRET — random secret used to sign OAuth state; use at least 32 random bytes.
- GA4_TOKEN_ENCRYPTION_KEY — a random 32-byte key, encoded as exactly 64 hexadecimal characters. Generate one locally with openssl rand -hex 32.
- APP_URL — canonical HTTPS origin with no trailing slash.
- Existing SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, and DEV_ACCESS_EMAILS settings.

Never commit these values or paste them into chat. Keep the encryption key stable; changing it makes previously stored refresh tokens unreadable. After setting variables, redeploy.

## 4. Connect and test

1. Sign in with an account that has developer access or an active subscription.
2. Open /acquisition.html.
3. Choose Connect Google, authorize read-only access, then select a GA4 property.
4. The connected Google account must have permission to view the selected GA4 property.
5. Verify sessions, users, channels, landing pages, and period comparisons against GA4 itself.
6. Create an experiment and confirm it remains after refresh and sign-out/sign-in.
7. Test disconnecting; confirm the stored connection is deleted.
8. Test with two separate accounts to verify neither can read the other's integration or experiments.

## Important limitations

- This first iteration uses GA4 for a common cross-channel view. It does not directly connect ad platforms, retrieve ad spend, or prove marketing ROI.
- keyEvents reflects events the customer has configured in GA4; it is not automatically a signup count. Customers must configure a real signup-completion event as a key event.
- The current insight text is deterministic and conservative. It does not yet call Claude to generate evidence-grounded growth recommendations.
- OAuth testing mode and Google's consent requirements may limit who can connect until the app is reviewed.
- No live deployment, Google OAuth, Supabase migration, or end-to-end tests have been run by this change.
