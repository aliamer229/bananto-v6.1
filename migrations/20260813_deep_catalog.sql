-- Expand game_catalog
ALTER TABLE game_catalog ADD COLUMN cover_box_url TEXT;
ALTER TABLE game_catalog ADD COLUMN cover_front_url TEXT;
ALTER TABLE game_catalog ADD COLUMN metacritic_score REAL;
ALTER TABLE game_catalog ADD COLUMN opencritic_score REAL;
ALTER TABLE game_catalog ADD COLUMN user_score REAL;
ALTER TABLE game_catalog ADD COLUMN size_gb REAL;
ALTER TABLE game_catalog ADD COLUMN players_count TEXT;
ALTER TABLE game_catalog ADD COLUMN languages_json TEXT; -- JSON array
ALTER TABLE game_catalog ADD COLUMN is_preorder BOOLEAN DEFAULT FALSE;
ALTER TABLE game_catalog ADD COLUMN is_switch2_enhanced BOOLEAN DEFAULT FALSE;
ALTER TABLE game_catalog ADD COLUMN upgrade_price_iqd INTEGER;

-- Nintendo specific info
CREATE TABLE IF NOT EXISTS game_nintendo_info (
    game_id TEXT PRIMARY KEY REFERENCES game_catalog(game_id) ON DELETE CASCADE,
    store_url TEXT,
    nso_required BOOLEAN,
    cloud_saves_supported BOOLEAN,
    is_game_key_card BOOLEAN,
    physical_download_required BOOLEAN,
    play_modes_json TEXT, -- JSON array (TV, Tabletop, Handheld)
    notes TEXT
);

-- Content & Story
CREATE TABLE IF NOT EXISTS game_chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT REFERENCES game_catalog(game_id) ON DELETE CASCADE,
    title TEXT,
    content TEXT,
    image_url TEXT,
    sort_order INTEGER
);

CREATE TABLE IF NOT EXISTS game_pillars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT REFERENCES game_catalog(game_id) ON DELETE CASCADE,
    title TEXT,
    explanation TEXT,
    image_url TEXT,
    sort_order INTEGER
);

-- Media
CREATE TABLE IF NOT EXISTS game_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT REFERENCES game_catalog(game_id) ON DELETE CASCADE,
    title TEXT,
    youtube_url TEXT
);

CREATE TABLE IF NOT EXISTS game_gallery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT REFERENCES game_catalog(game_id) ON DELETE CASCADE,
    image_url TEXT,
    description TEXT
);

-- Reviews & Ratings
CREATE TABLE IF NOT EXISTS game_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT REFERENCES game_catalog(game_id) ON DELETE CASCADE,
    source TEXT,
    score TEXT,
    quote TEXT,
    link TEXT
);

-- Technical Performance
CREATE TABLE IF NOT EXISTS game_performance (
    game_id TEXT PRIMARY KEY REFERENCES game_catalog(game_id) ON DELETE CASCADE,
    res_tv TEXT,
    res_handheld TEXT,
    fps TEXT,
    hdr_supported BOOLEAN,
    notes TEXT
);

-- Storage Details
CREATE TABLE IF NOT EXISTS game_storage (
    game_id TEXT PRIMARY KEY REFERENCES game_catalog(game_id) ON DELETE CASCADE,
    download_size_gb REAL,
    required_space_gb REAL,
    microsd_recommended BOOLEAN,
    notes TEXT
);

-- Multiplayer Details
CREATE TABLE IF NOT EXISTS game_multiplayer (
    game_id TEXT PRIMARY KEY REFERENCES game_catalog(game_id) ON DELETE CASCADE,
    local_players TEXT,
    online_players TEXT,
    is_coop BOOLEAN,
    is_competitive BOOLEAN,
    is_split_screen BOOLEAN,
    is_local_wireless BOOLEAN
);

-- Timeline & Updates
CREATE TABLE IF NOT EXISTS game_timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT REFERENCES game_catalog(game_id) ON DELETE CASCADE,
    event_date TEXT,
    title TEXT,
    details TEXT
);

CREATE TABLE IF NOT EXISTS game_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT REFERENCES game_catalog(game_id) ON DELETE CASCADE,
    version TEXT,
    release_date TEXT,
    changes TEXT
);

-- Music, Series, Studio
CREATE TABLE IF NOT EXISTS game_music (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT REFERENCES game_catalog(game_id) ON DELETE CASCADE,
    title TEXT,
    link TEXT
);

CREATE TABLE IF NOT EXISTS game_series (
    game_id TEXT PRIMARY KEY REFERENCES game_catalog(game_id) ON DELETE CASCADE,
    name TEXT,
    parts_list_json TEXT
);

CREATE TABLE IF NOT EXISTS game_studio (
    game_id TEXT PRIMARY KEY REFERENCES game_catalog(game_id) ON DELETE CASCADE,
    name TEXT,
    website TEXT,
    bio TEXT
);

-- FAQs
CREATE TABLE IF NOT EXISTS game_faqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT REFERENCES game_catalog(game_id) ON DELETE CASCADE,
    question TEXT,
    answer TEXT
);

-- Verdict
CREATE TABLE IF NOT EXISTS game_verdict (
    game_id TEXT PRIMARY KEY REFERENCES game_catalog(game_id) ON DELETE CASCADE,
    score REAL,
    summary TEXT,
    pros_json TEXT, -- JSON array
    cons_json TEXT  -- JSON array
);

-- Data Sources
CREATE TABLE IF NOT EXISTS game_data_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT REFERENCES game_catalog(game_id) ON DELETE CASCADE,
    source_name TEXT,
    source_url TEXT
);

