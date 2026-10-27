# Netlify deployment

Use Node.js 22 or newer. `netlify.toml` builds the SPA with `npm run build:client`, publishes `dist/spa`, bundles the Express function, and routes `/api/*` to it. All other paths fall back to the SPA.

Before deployment, apply the database schema and auth/contact migrations described in README.md. Configure `DATABASE_URL` and exact production `CORS_ORIGIN`. Set `APP_URL` and SMTP settings for real password-recovery delivery. Add server-only Supabase receipt-storage and Zoom settings only for those features.

Sign-in uses the app's own email/password authentication stored in Neon. Hosted auth, Google OAuth, Stripe, and JWT configuration from older deployment instructions are no longer part of this setup. Never commit database URLs, SMTP passwords, or service-role keys.

Run `npm test`, `npm run typecheck`, and `npm run build` before deploying. Verify `/api/health` and `/api/health-db` return success, the SPA loads directly on a nested route, and email/password session behavior works over HTTPS. A local build or saved environment draft does not publish a deployment.
