-- Extraction engine: per-field provenance, phase progress, verified images and
-- a per-game source registry. Additive only — existing rows keep working and no
-- existing data is rewritten.

-- Jobs gain the identity they resolved, their phase, and an honest outcome.
ALTER TABLE game_extraction_jobs ADD COLUMN phase TEXT;
ALTER TABLE game_extraction_jobs ADD COLUMN identity_json TEXT;
ALTER TABLE game_extraction_jobs ADD COLUMN summary_json TEXT;
ALTER TABLE game_extraction_jobs ADD COLUMN notes TEXT;

-- Field audits gain a numeric confidence, the phase they belong to, and the
-- full list of observations so a conflict can be inspected rather than guessed.
ALTER TABLE game_field_audits ADD COLUMN phase TEXT;
ALTER TABLE game_field_audits ADD COLUMN value_type TEXT;
ALTER TABLE game_field_audits ADD COLUMN confidence_score REAL DEFAULT 0;
ALTER TABLE game_field_audits ADD COLUMN observations TEXT DEFAULT '[]';
ALTER TABLE game_field_audits ADD COLUMN retrieved_at TEXT;

CREATE INDEX IF NOT EXISTS game_field_audits_job_idx ON game_field_audits (job_id, field_name);
CREATE INDEX IF NOT EXISTS game_field_audits_status_idx ON game_field_audits (status);

-- Verified images gain their measured size and acceptance tier.
ALTER TABLE game_images ADD COLUMN job_id TEXT;
ALTER TABLE game_images ADD COLUMN width INTEGER;
ALTER TABLE game_images ADD COLUMN height INTEGER;
ALTER TABLE game_images ADD COLUMN tier TEXT;
ALTER TABLE game_images ADD COLUMN description TEXT;

-- Which phases ran, and how each one landed.
CREATE TABLE IF NOT EXISTS game_extraction_phases (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  game_id TEXT,
  phase TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  missing INTEGER NOT NULL DEFAULT 0,
  conflict INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS game_extraction_phases_idx
  ON game_extraction_phases (job_id, phase);

-- Every source consulted for a game, and which fields it supplied.
CREATE TABLE IF NOT EXISTS game_sources (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  job_id TEXT,
  source_key TEXT,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  fields_json TEXT NOT NULL DEFAULT '[]',
  retrieved_at TEXT NOT NULL,
  confidence REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS game_sources_game_idx ON game_sources (game_id);
CREATE UNIQUE INDEX IF NOT EXISTS game_sources_url_idx ON game_sources (game_id, source_url);

-- Canonical identity records, one row per platform/edition/region product.
CREATE TABLE IF NOT EXISTS game_records (
  game_id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  english_title TEXT,
  japanese_title TEXT,
  normalized_name TEXT,
  aliases_json TEXT DEFAULT '[]',
  platform TEXT,
  edition TEXT,
  region TEXT,
  publisher TEXT,
  developer TEXT,
  release_date TEXT,
  release_status TEXT,
  nsuid TEXT,
  title_id TEXT,
  identity_confidence REAL DEFAULT 0,
  identity_sources_json TEXT DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS game_records_norm_idx ON game_records (normalized_name);
CREATE INDEX IF NOT EXISTS game_records_platform_idx ON game_records (platform);
