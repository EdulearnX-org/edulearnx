BEGIN;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS zoom_link TEXT;
CREATE TABLE IF NOT EXISTS class_schedule_batches (
  actor_id TEXT NOT NULL,
  request_id UUID NOT NULL,
  request_hash CHAR(64) NOT NULL,
  class_ids JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(actor_id,request_id)
);
CREATE TABLE IF NOT EXISTS upload_intents (
  id UUID PRIMARY KEY,
  token_hash CHAR(64) NOT NULL,
  owner_id TEXT,
  purpose TEXT NOT NULL CHECK(purpose IN ('receipt','certificate')),
  bucket TEXT NOT NULL,
  object_path TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 1 AND 5242880),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','claimed','deleting')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '2 hours 10 minutes'
);
CREATE INDEX IF NOT EXISTS upload_intents_cleanup_idx ON upload_intents(expires_at) WHERE status <> 'claimed';
CREATE TABLE IF NOT EXISTS request_limits (
  key_hash CHAR(64) PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS request_limits_expiry_idx ON request_limits(expires_at);
CREATE TABLE IF NOT EXISTS app_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO app_migrations(version) VALUES('20261031_audit_repairs') ON CONFLICT DO NOTHING;
COMMIT;
