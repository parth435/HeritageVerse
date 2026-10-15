-- Add account status for existing databases without changing account ownership or data.
-- Missing/blank legacy statuses default to ACTIVE; unrecognized values fail closed as SUSPENDED.
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

UPDATE users
   SET status = CASE
     WHEN status IS NULL OR BTRIM(status) = '' THEN 'ACTIVE'
     WHEN UPPER(BTRIM(status)) IN ('ACTIVE', 'SUSPENDED') THEN UPPER(BTRIM(status))
     ELSE 'SUSPENDED'
   END
 WHERE status IS NULL OR status <> CASE
     WHEN status IS NULL OR BTRIM(status) = '' THEN 'ACTIVE'
     WHEN UPPER(BTRIM(status)) IN ('ACTIVE', 'SUSPENDED') THEN UPPER(BTRIM(status))
     ELSE 'SUSPENDED'
   END;

ALTER TABLE users ALTER COLUMN status SET DEFAULT 'ACTIVE';
ALTER TABLE users ALTER COLUMN status SET NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('ACTIVE', 'SUSPENDED'));

COMMIT;
