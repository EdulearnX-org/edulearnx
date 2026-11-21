-- Remove the three-day 2FA rollout timer. Users may dismiss the reminder,
-- but it returns on their next sign-in until they enable authenticator 2FA.
BEGIN;
ALTER TABLE users ALTER COLUMN two_factor_required_at DROP DEFAULT;
UPDATE users
SET two_factor_required_at = NULL,
    two_factor_defer_used = FALSE
WHERE two_factor_enabled = FALSE;
INSERT INTO app_migrations(version) VALUES ('20261121_remove_totp_setup_deadline')
ON CONFLICT (version) DO NOTHING;
COMMIT;
