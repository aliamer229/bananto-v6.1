-- Critical authentication/storage tables for Telegram ownership proof and
-- server-side abuse controls. Runtime bootstrapping remains idempotent for
-- deployments whose older migration chain was only partially applied.

CREATE TABLE IF NOT EXISTS telegram_links (
  user_id TEXT PRIMARY KEY,
  telegram_chat_id INTEGER UNIQUE NOT NULL,
  telegram_user_id TEXT,
  telegram_username TEXT,
  telegram_phone TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  linked_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_verification_sessions (
  id TEXT PRIMARY KEY,
  owner_key TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  telegram_user_id TEXT,
  telegram_chat_id INTEGER,
  telegram_phone TEXT,
  token TEXT UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified_at TEXT
);

CREATE INDEX IF NOT EXISTS tg_verif_owner_idx
  ON telegram_verification_sessions(owner_key);

CREATE TABLE IF NOT EXISTS security_rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_started INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

