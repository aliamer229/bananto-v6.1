-- Cloudflare D1 schema for the store.
-- Apply with: bunx wrangler d1 migrations apply banana-store --remote

CREATE TABLE IF NOT EXISTS store_kv (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT,
  password_hash TEXT NOT NULL DEFAULT '',
  avatar        TEXT,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  provider      TEXT NOT NULL DEFAULT 'password',
  provider_id   TEXT,
  settings      TEXT NOT NULL DEFAULT '{}',
  addresses     TEXT NOT NULL DEFAULT '[]',
  favorites     TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (email);
CREATE INDEX IF NOT EXISTS users_provider_idx ON users (provider, provider_id);

CREATE TABLE IF NOT EXISTS orders (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  doc        TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS threads (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  order_id        TEXT,
  doc             TEXT NOT NULL,
  last_message_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS threads_user_idx ON threads (user_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  thread_id  TEXT NOT NULL,
  doc        TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages (thread_id, created_at);
