-- Legacy Staging and Claim System Schema
-- Keeps all legacy data completely isolated from live users and production workflows.

CREATE TABLE IF NOT EXISTS legacy_users (
  id TEXT PRIMARY KEY,
  legacy_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  username TEXT,
  email TEXT,
  normalized_email TEXT,
  phone TEXT,
  normalized_phone TEXT,
  banana_balance INTEGER NOT NULL DEFAULT 0,
  store_credit_iqd INTEGER NOT NULL DEFAULT 0,
  claim_state TEXT NOT NULL DEFAULT 'unclaimed',
  claimed_by_user_id TEXT,
  claimed_at TEXT,
  legacy_created_at TEXT,
  raw_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_legacy_users_email ON legacy_users(normalized_email);
CREATE INDEX IF NOT EXISTS idx_legacy_users_phone ON legacy_users(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_legacy_users_claimed ON legacy_users(claim_state, claimed_by_user_id);

CREATE TABLE IF NOT EXISTS legacy_claims (
  id TEXT PRIMARY KEY,
  legacy_user_id TEXT UNIQUE NOT NULL,
  claimed_by_user_id TEXT NOT NULL,
  claim_type TEXT NOT NULL,
  claim_identifier TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  banana_transferred INTEGER NOT NULL DEFAULT 0,
  orders_linked INTEGER NOT NULL DEFAULT 0,
  threads_linked INTEGER NOT NULL DEFAULT 0,
  reviews_linked INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  error_log TEXT,
  FOREIGN KEY (legacy_user_id) REFERENCES legacy_users(legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_legacy_claims_user ON legacy_claims(claimed_by_user_id);

CREATE TABLE IF NOT EXISTS legacy_banana_transactions (
  id TEXT PRIMARY KEY,
  legacy_id TEXT,
  legacy_user_id TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  balance_after INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  type TEXT,
  created_at TEXT,
  raw_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_legacy_banana_tx_user ON legacy_banana_transactions(legacy_user_id);

CREATE TABLE IF NOT EXISTS legacy_orders (
  id TEXT PRIMARY KEY,
  legacy_id TEXT UNIQUE NOT NULL,
  legacy_user_id TEXT NOT NULL,
  claimed_by_user_id TEXT,
  order_no TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  legacy_original_status TEXT,
  migration_archive INTEGER NOT NULL DEFAULT 1,
  total_iqd INTEGER NOT NULL DEFAULT 0,
  total_usd REAL NOT NULL DEFAULT 0,
  payment_method TEXT,
  created_at TEXT,
  raw_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_legacy_orders_user ON legacy_orders(legacy_user_id);
CREATE INDEX IF NOT EXISTS idx_legacy_orders_claimed_user ON legacy_orders(claimed_by_user_id);

CREATE TABLE IF NOT EXISTS legacy_order_items (
  id TEXT PRIMARY KEY,
  legacy_order_id TEXT NOT NULL,
  product_id TEXT,
  product_name TEXT NOT NULL DEFAULT '',
  platform TEXT,
  unit_price REAL NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  kind TEXT NOT NULL DEFAULT 'account',
  raw_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_legacy_order_items_order ON legacy_order_items(legacy_order_id);

CREATE TABLE IF NOT EXISTS legacy_threads (
  id TEXT PRIMARY KEY,
  legacy_id TEXT UNIQUE NOT NULL,
  legacy_user_id TEXT NOT NULL,
  claimed_by_user_id TEXT,
  subject TEXT,
  order_id TEXT,
  status TEXT NOT NULL DEFAULT 'closed',
  mode TEXT NOT NULL DEFAULT 'RESOLVED',
  ai_paused INTEGER NOT NULL DEFAULT 1,
  needs_admin INTEGER NOT NULL DEFAULT 0,
  migration_archive INTEGER NOT NULL DEFAULT 1,
  legacy_original_status TEXT,
  created_at TEXT,
  raw_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_legacy_threads_user ON legacy_threads(legacy_user_id);
CREATE INDEX IF NOT EXISTS idx_legacy_threads_claimed_user ON legacy_threads(claimed_by_user_id);

CREATE TABLE IF NOT EXISTS legacy_messages (
  id TEXT PRIMARY KEY,
  legacy_thread_id TEXT NOT NULL,
  sender_role TEXT NOT NULL DEFAULT 'assistant',
  sender_name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'text',
  body TEXT NOT NULL DEFAULT '{}',
  data_json TEXT,
  created_at TEXT,
  raw_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_legacy_messages_thread ON legacy_messages(legacy_thread_id);

CREATE TABLE IF NOT EXISTS legacy_reviews (
  id TEXT PRIMARY KEY,
  legacy_id TEXT UNIQUE NOT NULL,
  legacy_user_id TEXT NOT NULL,
  claimed_by_user_id TEXT,
  product_id TEXT,
  legacy_game_id TEXT,
  legacy_game_name TEXT,
  slug TEXT,
  platform TEXT,
  rating INTEGER NOT NULL DEFAULT 5,
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'approved',
  is_approved INTEGER NOT NULL DEFAULT 1,
  unresolved INTEGER NOT NULL DEFAULT 1,
  matched_game_id TEXT,
  matched_method TEXT,
  created_at TEXT,
  raw_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_legacy_reviews_product ON legacy_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_legacy_reviews_user ON legacy_reviews(legacy_user_id);

CREATE TABLE IF NOT EXISTS legacy_review_images (
  id TEXT PRIMARY KEY,
  legacy_review_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'product_photo',
  is_private INTEGER NOT NULL DEFAULT 0,
  r2_storage TEXT NOT NULL DEFAULT 'BANANTO_BUCKET',
  r2_key TEXT,
  raw_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_legacy_review_images_review ON legacy_review_images(legacy_review_id);

CREATE TABLE IF NOT EXISTS legacy_media (
  id TEXT PRIMARY KEY,
  original_url TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'product_photo',
  v4_target_storage TEXT NOT NULL DEFAULT 'BANANTO_BUCKET',
  v4_target_key TEXT NOT NULL,
  v4_access_policy TEXT NOT NULL DEFAULT 'public',
  legacy_user_id TEXT,
  claimed_by_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_log TEXT
);

CREATE INDEX IF NOT EXISTS idx_legacy_media_user ON legacy_media(legacy_user_id);
CREATE INDEX IF NOT EXISTS idx_legacy_media_claimed ON legacy_media(claimed_by_user_id);

CREATE TABLE IF NOT EXISTS legacy_import_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  is_dry_run INTEGER NOT NULL DEFAULT 1,
  counts_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  logs TEXT
);
