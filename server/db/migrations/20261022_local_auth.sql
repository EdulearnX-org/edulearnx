-- Apply after the core users table exists. If case-insensitive duplicate emails
-- exist, resolve them explicitly before applying this index; never merge roles automatically.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email));
-- Text user IDs support both legacy integer and UUID users tables.
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions (user_id);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Older application schemas require an audit creator. Preserve every existing
-- creator; backfill self-service ownership only where this field is absent/null.
ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS created_by TEXT;
UPDATE password_reset_tokens SET created_by=user_id WHERE created_by IS NULL;
ALTER TABLE password_reset_tokens ALTER COLUMN created_by SET NOT NULL;
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens (user_id);
COMMIT;
