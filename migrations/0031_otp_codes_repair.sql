-- migrations/0002_otp_phone.sql created `otp_codes` with only
--   (id, phone, purpose, code_hash, expires_at, attempts, created_at)
-- while the application has since written user_id, channel, destination and
-- verified_at as well. `CREATE TABLE IF NOT EXISTS` never widens an existing
-- table, so on every database that ran 0002 the INSERT failed with
-- "table otp_codes has no column named user_id" and the whole verification
-- flow (signup, password reset, phone confirmation) reported a server error.
--
-- SQLite has no `ADD COLUMN IF NOT EXISTS`. Each statement below is expected to
-- fail on a database that already has the column; apply the file with
-- `wrangler d1 migrations apply` and ignore duplicate-column errors, or rely on
-- src/lib/d1.server.ts `ensureOtpSchema()` which performs the same repair
-- idempotently at runtime.

ALTER TABLE otp_codes ADD COLUMN user_id TEXT;
ALTER TABLE otp_codes ADD COLUMN channel TEXT NOT NULL DEFAULT 'whatsapp';
ALTER TABLE otp_codes ADD COLUMN destination TEXT;
ALTER TABLE otp_codes ADD COLUMN verified_at TEXT;

CREATE INDEX IF NOT EXISTS otp_phone_idx ON otp_codes (phone, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS otp_user_idx ON otp_codes (user_id);
