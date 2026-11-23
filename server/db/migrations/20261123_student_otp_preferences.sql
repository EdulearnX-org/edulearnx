-- Student email OTP policy and personal opt-out preference.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS student_email_otp_enabled BOOLEAN NOT NULL DEFAULT TRUE;
CREATE TABLE IF NOT EXISTS app_settings (
 setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_by TEXT
);
INSERT INTO app_settings(setting_key,setting_value) VALUES ('student_email_otp_required','false') ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO app_migrations(version) VALUES ('20261123_student_otp_preferences') ON CONFLICT (version) DO NOTHING;
COMMIT;