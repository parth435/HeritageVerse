-- Apply after backing up and verifying the existing users table.
-- Existing ordinary accounts remain least-privileged users. Existing ADMIN/USER
-- values are case-normalized only; administrator promotion remains a separate,
-- audited database operation after confirming the account owner's identity.
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
UPDATE users SET role = lower(role)
 WHERE lower(role) IN ('user', 'admin') AND role <> lower(role);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));

-- Example bootstrap, intentionally commented out:
-- UPDATE users SET role = 'admin' WHERE email = 'verified-admin@example.com';

COMMIT;
