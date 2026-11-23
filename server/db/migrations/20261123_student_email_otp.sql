-- Email OTP verification for student registration and every student login.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS pending_student_registrations (
  token_hash CHAR(64) PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS pending_student_registrations_expiry_idx ON pending_student_registrations(expires_at);
CREATE TABLE IF NOT EXISTS email_otp_challenges (
  token_hash CHAR(64) PRIMARY KEY,
  user_id TEXT NOT NULL,
  code_hash CHAR(64) NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('login')),
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS email_otp_challenges_expiry_idx ON email_otp_challenges(expires_at);
-- Students no longer use authenticator-app 2FA. Admin/teacher settings are preserved.
UPDATE users
SET two_factor_enabled = FALSE,
    two_factor_secret_enc = NULL,
    two_factor_pending_secret_enc = NULL,
    two_factor_required_at = NULL,
    two_factor_defer_used = FALSE
WHERE role = 'student';
INSERT INTO app_migrations(version) VALUES ('20261123_student_email_otp')
ON CONFLICT (version) DO NOTHING;
COMMIT;
