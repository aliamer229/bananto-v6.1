-- 0033_binance_topups.sql
-- Automated Binance Pay verification and wallet top-up tables

CREATE TABLE IF NOT EXISTS binance_topup_intents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expected_amount_atomic INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USDT',
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'verifying', 'credited', 'expired', 'cancelled', 'failed')
  ),
  bound_transaction_id TEXT UNIQUE,
  verify_attempts INTEGER NOT NULL DEFAULT 0,
  last_verify_at INTEGER,
  verify_started_at INTEGER,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  credited_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_binance_intent_user ON binance_topup_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_binance_intent_status ON binance_topup_intents(status);
CREATE INDEX IF NOT EXISTS idx_binance_intent_expiry ON binance_topup_intents(expires_at);

CREATE TABLE IF NOT EXISTS binance_topups (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  binance_transaction_id TEXT NOT NULL UNIQUE,
  amount_atomic INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USDT',
  transaction_time INTEGER NOT NULL,
  order_type TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  credited_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_binance_topups_user ON binance_topups(user_id);
CREATE INDEX IF NOT EXISTS idx_binance_topups_tx ON binance_topups(binance_transaction_id);

CREATE TABLE IF NOT EXISTS binance_verification_logs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  intent_id TEXT,
  masked_tx_id TEXT,
  result TEXT NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  upstream_status INTEGER,
  rejection_code TEXT,
  client_ip_hash TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_binance_logs_user ON binance_verification_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_binance_logs_intent ON binance_verification_logs(intent_id);
