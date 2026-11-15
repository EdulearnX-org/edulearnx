# EduLearnX

EduLearnX uses React/Vite, an Express API, and Neon Postgres. Authentication belongs to this app: email/password accounts, bcrypt password hashes, opaque database sessions, and password recovery. Neither Neon Auth nor Supabase Auth is used.

## Development

Use Node.js 22.12 or newer and the existing checkout. Cloud tasks are already isolated; do not create another Git worktree unless requested.

```sh
npm ci
npm run cloud:dev
```

The cloud launcher uses the configured `DATABASE_URL`. Neon connections use secure WebSockets so transactions work through the cloud HTTPS proxy. Other Postgres servers use native `pg`. Development startup applies additive core/auth/contact/audit-repair schema changes; existing courses, prices, publication flags, and enrollments are preserved.

With no database configured, the launcher starts isolated Postgres in Docker. To explicitly use that local database instead of the configured Neon database, run `npm run cloud:dev -- --local`. Database files live outside the checkout in `/workspace/.edulearnx/postgres`; container images are retained in `/workspace/.edulearnx/images.tar` during onboarding. Both service ports bind only to loopback. Local Postgres uses trust authentication and is strictly for isolated development.

If SMTP is not configured, the launcher starts Mailpit and captures password-reset messages locally. It never sends them to real inboxes. The app listens on port 5173; the internal mail-capture API uses port 18025. Live processes must restart in every new task.

```sh
npm test
npm run typecheck
npm run build
node scripts/smoke-cloud.mjs          # app must be running with --local
node scripts/smoke-cloud.mjs --neon   # app must be running with configured Neon
```

The smoke test creates and removes uniquely named test records and verifies database health, registration, login, session hashing/revocation, SMTP recovery, single-use reset links, course pricing, and contact persistence. It requires the development mail capture service. Do not run it against production.

## Accounts and recovery

Registration always creates a student. It cannot overwrite an existing account or obtain an admin role from an email address. Existing local bcrypt/SHA256 passwords remain usable; SHA256 hashes upgrade to bcrypt after successful login. Accounts previously provisioned through hosted authentication may have an unknown random local password and must use password recovery. Existing roles remain intact.

Sessions use random tokens stored only in HTTP-only cookies; the database stores token hashes and expiry times. Logout revokes the session, and a password reset revokes all sessions. Client profiles are server-verified and held in memory.

Admin-created accounts receive an unusable random password and must use password recovery to establish one. Configure real SMTP before onboarding real users. To bootstrap an administrator, an authorized database owner must explicitly grant an existing verified account its role and permissions. Public signup never performs this promotion. The primary-admin email policy is defined in `shared/adminPermissions.ts`.

For real password recovery configure `SMTP_HOST`, `SMTP_PORT` (usually 587), `SMTP_SECURE` (`true` for implicit TLS on port 465), `SMTP_FROM`, and `APP_URL`. Set `SMTP_USER` and `SMTP_PASSWORD` together when authentication is required. Remote SMTP requires verified TLS. `APP_URL` must be HTTPS in production. Store credentials securely in environment settings or ignored `.env.local`; never commit them.

## Production and migrations

`DATABASE_URL` is required. Same-origin deployments can omit `CORS_ORIGIN`; production then sends no cross-origin access headers. For a frontend on a separate origin, configure `CORS_ORIGIN` as an exact comma-separated list of allowed origins. Apply the core schema before deployment, followed by `server/db/migrations/20261022_local_auth.sql`, `server/db/migrations/20261022_contact.sql`, `server/db/migrations/20261030_course_zoom_link.sql`, and `server/db/migrations/20261031_audit_repairs.sql`. The audit migration adds upload intents, submission rate limits, atomic schedule request records, and the migration version marker. Case-insensitive duplicate account emails must be resolved explicitly before the auth migration; roles are never merged automatically. Production startup and `/api/health` check required columns and migration version `20261031_audit_repairs`; production does not automatically initialize them. For a controlled persistent-server migration only, `INITIALIZE_DATABASE_ON_STARTUP=true` enables the repository initializer; leave it off in serverless deployments.

```sh
npm run build
npm start
```

The client builds into `dist/spa` and the server entry is `dist/server/node-build.mjs`. Vercel routes nested API paths to the native `api/index.ts` function and uses `npm run build:vercel`. Netlify settings are in `netlify.toml`; see `NETLIFY_DEPLOY.md`. Deployment/publication requires a separate user action. Generated `dist/` output is ignored and must be rebuilt for each deployment. CI runs installation, type checking, tests, and both production builds.

The `.openai/hosting.json` static target also points to `dist/spa`, but static hosting alone cannot run the API. Use the Vercel, Netlify, or persistent Express configurations for a complete application. Before using a separate static host, configure and verify same-origin `/api/*` forwarding and SPA fallback routing; the static descriptor does not supply either an API runtime or its routing.

Old environment bindings `VITE_NEON_AUTH_URL`, `NEON_AUTH_URL`, and Supabase publishable/anon authentication keys are unnecessary for sign-in and can be removed from environment settings. Existing binding values are never copied into the repository.

## Optional enrollment storage and video

Course teachers and admins with course-management permission can save a Zoom invitation link on each course in their portal. Enrolled students can open it with **Join class** on their dashboard, enrolled-course list, or catalog card. Links are private to enrolled students, assigned teachers, and course administrators. Existing production databases must apply `server/db/migrations/20261030_course_zoom_link.sql`; development startup adds the column automatically. This works with ordinary Zoom invitation links and does not require Zoom Video SDK credentials.

Supabase remains an optional server-side integration for enrollment applications and private payment receipts, independent of authentication. Configure `SUPABASE_URL` (or existing `VITE_SUPABASE_URL`) and `SUPABASE_SECRET_KEY` (legacy service-role key also accepted). Never expose this server key through a `VITE_` variable. Apply `supabase/migrations/20261016_enrollment_applications.sql` in the intended Supabase project. It creates the application table, row-level security, and private `payment-receipts` bucket. Also apply `supabase/migrations/20261031_private_certificates.sql` for the private `tutor-certificates` bucket. Both migrations belong in Supabase; the audit-repair migration belongs in the application Postgres database. Tutor applications require private storage as well.

Clients request short-lived signed upload URLs, upload binary files directly to private storage, then submit upload references in small JSON requests. Each file is limited to 5 MB; the server verifies its recorded size and file signature before accepting the application. Receipt uploads require the authenticated student session; tutor uploads use single-use capability tokens and rate limits. The API JSON request limit is 1 MB. Certificate lists contain presence flags, and authorized administrators obtain short-lived signed URLs for individual files.

Receipt routes use the authenticated app session. Approval grants durable Neon enrollment before finalizing the application and queuing receipt deletion. Review retries reconcile committed enrollments after transient failures. Signed receipt URLs expire after 120 seconds and can be refreshed.

Zoom video requires `ZOOM_VIDEO_SDK_KEY` and `ZOOM_VIDEO_SDK_SECRET`. Tests cover classroom lifecycle and SDK calls; actual multi-user media and external receipt storage require their real project credentials.

## Scheduled maintenance

Set a strong `CRON_SECRET` for `GET /api/internal/maintenance`. Requests require `Authorization: Bearer <CRON_SECRET>` and perform bounded retries of pending receipt deletions and abandoned upload cleanup. Cleanup work persists in the databases; requests from visitors and admin queue reads do not start maintenance.

`vercel.json` schedules this endpoint daily at 03:00 UTC; Vercel supplies the configured secret automatically ([cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs)). Netlify uses `netlify/functions/maintenance.mjs` hourly; [scheduled functions](https://docs.netlify.com/build/functions/scheduled-functions/) are not public HTTP endpoints. For a persistent server, configure an external scheduler to call the protected endpoint regularly. Monitor scheduler failures and cleanup backlog, and increase frequency or capacity if daily batches cannot drain it. The schedules take effect after deployment; no migrations or deployment are performed by editing these files.

## Current product boundaries

Payments remain manual transfers reviewed by administrators. The payment status screen reads the signed-in student's application from the server; URL parameters cannot establish payment or enrollment. Draft courses are hidden from the public catalog and new applications while assigned teachers, enrolled students, and authorized course administrators retain portal access. Lesson completion is the source of course progress, but a frontend lesson player remains separate feature work; student learning actions open the available class experience.

Bundle and promotion management does not yet provide checkout redemption. Revenue reporting is unavailable until actual payment amounts and accounting rules are implemented; a displayed zero must not be interpreted as verified revenue. Those capabilities remain separate feature work.

Local regression tests and builds do not verify real SMTP delivery, external private-storage operations, authenticated production browser journeys, or multi-user Zoom media. Validate these integrations in the intended deployment environment before relying on them.
