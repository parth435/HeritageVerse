-- Create the append-only record store used to audit privileged admin changes.
BEGIN;

CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);

COMMIT;
