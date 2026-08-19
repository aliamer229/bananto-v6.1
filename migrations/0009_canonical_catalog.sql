-- Canonical Nintendo Switch 1 / Switch 2 game catalogue, trade rules and audit
-- trail. Additive only: existing rows keep working.

ALTER TABLE game_catalog ADD COLUMN game_id TEXT;
ALTER TABLE game_catalog ADD COLUMN canonical_name TEXT;
ALTER TABLE game_catalog ADD COLUMN english_name TEXT;
ALTER TABLE game_catalog ADD COLUMN japanese_name TEXT;
ALTER TABLE game_catalog ADD COLUMN normalized_name TEXT;
ALTER TABLE game_catalog ADD COLUMN base_normalized TEXT;
ALTER TABLE game_catalog ADD COLUMN base_game_id TEXT;
ALTER TABLE game_catalog ADD COLUMN switch_version TEXT;
ALTER TABLE game_catalog ADD COLUMN edition TEXT;
ALTER TABLE game_catalog ADD COLUMN region TEXT;
ALTER TABLE game_catalog ADD COLUMN developer TEXT;
ALTER TABLE game_catalog ADD COLUMN franchise TEXT;
ALTER TABLE game_catalog ADD COLUMN box_front_url TEXT;
ALTER TABLE game_catalog ADD COLUMN box_back_url TEXT;
ALTER TABLE game_catalog ADD COLUMN trailer_url TEXT;
ALTER TABLE game_catalog ADD COLUMN official_url TEXT;
ALTER TABLE game_catalog ADD COLUMN eshop_url TEXT;
ALTER TABLE game_catalog ADD COLUMN nsuid TEXT;
ALTER TABLE game_catalog ADD COLUMN title_id TEXT;
ALTER TABLE game_catalog ADD COLUMN product_code TEXT;
ALTER TABLE game_catalog ADD COLUMN players TEXT;
ALTER TABLE game_catalog ADD COLUMN modes TEXT;
ALTER TABLE game_catalog ADD COLUMN language_support TEXT;
ALTER TABLE game_catalog ADD COLUMN age_rating TEXT;
ALTER TABLE game_catalog ADD COLUMN trade_value_source TEXT;
ALTER TABLE game_catalog ADD COLUMN trade_value_updated_at TEXT;
ALTER TABLE game_catalog ADD COLUMN ai_suggested_trade_iqd INTEGER;
ALTER TABLE game_catalog ADD COLUMN completeness INTEGER DEFAULT 0;
ALTER TABLE game_catalog ADD COLUMN is_active INTEGER DEFAULT 1;
ALTER TABLE game_catalog ADD COLUMN needs_review INTEGER DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS game_catalog_game_id_idx ON game_catalog (game_id);
CREATE INDEX IF NOT EXISTS game_catalog_norm_idx ON game_catalog (normalized_name);
CREATE INDEX IF NOT EXISTS game_catalog_base_idx ON game_catalog (base_normalized);
CREATE INDEX IF NOT EXISTS game_catalog_version_idx ON game_catalog (switch_version);
CREATE INDEX IF NOT EXISTS game_catalog_price_idx ON game_catalog (trade_value_iqd);

CREATE TABLE IF NOT EXISTS game_aliases (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  normalized TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'user_variant',
  language TEXT,
  region TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS game_aliases_norm_idx ON game_aliases (normalized);
CREATE INDEX IF NOT EXISTS game_aliases_game_idx ON game_aliases (game_id);

CREATE TABLE IF NOT EXISTS game_images (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  url TEXT NOT NULL,
  source_name TEXT,
  source_url TEXT,
  region TEXT,
  platform TEXT,
  edition TEXT,
  confidence REAL DEFAULT 0,
  verified INTEGER DEFAULT 0,
  is_primary INTEGER DEFAULT 0,
  evidence TEXT,
  created_at TEXT NOT NULL,
  verified_at TEXT
);
CREATE INDEX IF NOT EXISTS game_images_game_idx ON game_images (game_id, kind);

CREATE TABLE IF NOT EXISTS game_price_history (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  old_value_iqd INTEGER,
  new_value_iqd INTEGER,
  source TEXT,
  actor TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS game_price_history_idx ON game_price_history (game_id, created_at DESC);

CREATE TABLE IF NOT EXISTS trade_rules (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  label_ar TEXT NOT NULL,
  label_en TEXT,
  percent REAL NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS trade_rules_key_idx ON trade_rules (category, key);

CREATE TABLE IF NOT EXISTS disc_trade_images (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  url TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS disc_trade_images_idx ON disc_trade_images (trade_id);

CREATE TABLE IF NOT EXISTS delivery_events (
  id TEXT PRIMARY KEY,
  context_kind TEXT NOT NULL,
  context_id TEXT NOT NULL,
  event TEXT NOT NULL,
  actor TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS delivery_events_idx ON delivery_events (context_kind, context_id, created_at);

CREATE TABLE IF NOT EXISTS disc_trades (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, game_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', valuation_iqd INTEGER,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_extraction_jobs (
  id TEXT PRIMARY KEY, game_id TEXT, game_name TEXT NOT NULL,
  status TEXT DEFAULT 'QUEUED', current_section TEXT, current_field TEXT,
  progress REAL DEFAULT 0, model TEXT, started_at TEXT, updated_at TEXT,
  completed_at TEXT, error TEXT
);

CREATE TABLE IF NOT EXISTS game_field_audits (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL, game_id TEXT,
  field_name TEXT NOT NULL, field_value TEXT, source_name TEXT,
  source_url TEXT, confidence TEXT, verified INTEGER DEFAULT 0,
  evidence TEXT, last_verified TEXT
);

ALTER TABLE disc_trades ADD COLUMN game_id TEXT;
ALTER TABLE disc_trades ADD COLUMN selections TEXT DEFAULT '{}';
ALTER TABLE disc_trades ADD COLUMN base_iqd INTEGER;
ALTER TABLE disc_trades ADD COLUMN final_iqd INTEGER;
ALTER TABLE disc_trades ADD COLUMN admin_valuation_iqd INTEGER;
ALTER TABLE disc_trades ADD COLUMN payout_type TEXT;
ALTER TABLE disc_trades ADD COLUMN status_history TEXT DEFAULT '[]';
ALTER TABLE disc_trades ADD COLUMN admin_notes TEXT;
ALTER TABLE disc_trades ADD COLUMN thread_id TEXT;

ALTER TABLE game_field_audits ADD COLUMN status TEXT DEFAULT 'verified';
ALTER TABLE game_field_audits ADD COLUMN attempted_sources TEXT DEFAULT '[]';
ALTER TABLE game_field_audits ADD COLUMN failure_reason TEXT;
CREATE INDEX IF NOT EXISTS game_field_audits_game_idx ON game_field_audits (game_id, field_name);

ALTER TABLE messages ADD COLUMN context_kind TEXT DEFAULT 'general';
ALTER TABLE messages ADD COLUMN context_id TEXT;
ALTER TABLE messages ADD COLUMN internal INTEGER DEFAULT 0;
