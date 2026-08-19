-- Phone verification + WhatsApp one-time codes.
-- Apply with: bunx wrangler d1 migrations apply banana-store --remote

ALTER TABLE users ADD COLUMN phone_verified_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_idx ON users (phone);

CREATE TABLE IF NOT EXISTS otp_codes (
  id         TEXT PRIMARY KEY,
  phone      TEXT NOT NULL,
  purpose    TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS otp_phone_idx ON otp_codes (phone, purpose, created_at DESC);
