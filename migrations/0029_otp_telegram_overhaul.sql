-- Create telegram_link_tokens table for secure linking
CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  telegram_chat_id INTEGER,
  telegram_user_id TEXT,
  used_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Ensure telegram_links has necessary columns (adding if missing, though likely present)
-- D1 doesn't support ADD COLUMN IF NOT EXISTS easily in a single statement without a helper,
-- but we can use a safe approach.
-- Based on the user's input, these columns should be there or we should respect them.
-- The user mentioned: user_id, telegram_chat_id, telegram_username, linked_at, telegram_user_id, verified, updated_at.

-- Create telegram_otp_sessions for signup/guest flow
CREATE TABLE IF NOT EXISTS telegram_otp_sessions (
  id TEXT PRIMARY KEY,
  session_token TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  purpose TEXT NOT NULL,
  user_id TEXT,
  telegram_chat_id INTEGER,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_user_id ON telegram_link_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_otp_sessions_token ON telegram_otp_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_telegram_otp_sessions_phone ON telegram_otp_sessions(phone);

-- The otp_codes table should already exist. We just need to make sure we don't use code_raw.
-- If we want to be strict, we could drop the column, but D1 (SQLite) doesn't support DROP COLUMN well.
-- We will just ignore it in the code as requested.
