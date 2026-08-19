CREATE TABLE IF NOT EXISTS game_catalog (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL, -- 'switch', 'switch-2'
    publisher TEXT,
    release_year INTEGER,
    cover_url TEXT,
    trade_value_iqd INTEGER DEFAULT 0,
    is_enriched BOOLEAN DEFAULT FALSE,
    raw_source_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_game_catalog_title ON game_catalog(title);
CREATE INDEX IF NOT EXISTS idx_game_catalog_platform ON game_catalog(platform);
CREATE INDEX IF NOT EXISTS idx_game_catalog_trade_value ON game_catalog(trade_value_iqd);
