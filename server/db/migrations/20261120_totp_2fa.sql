-- EduLearnX TOTP two-factor authentication.
-- Existing accounts receive a three-day rollout window from migration time.
-- New accounts use the same three-day default from their creation time.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret_enc TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_pending_secret_enc TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_required_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '3 days');
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_last_verified_at TIMESTAMPTZ;
UPDATE users SET two_factor_required_at = CURRENT_TIMESTAMP + INTERVAL '3 days'
 WHERE two_factor_required_at IS NULL;
CREATE INDEX IF NOT EXISTS users_two_factor_required_idx ON users(two_factor_required_at)
 WHERE two_factor_enabled = FALSE;
INSERT INTO app_migrations(version) VALUES ('20261120_totp_2fa')
 ON CONFLICT (version) DO NOTHING;
COMMIT;
