-- Additive game ↔ hardware performance projection and revision history.
-- Canonical values remain on the game product; these tables provide indexed
-- lookup, uniqueness, pagination and a future-safe history trail.

CREATE TABLE IF NOT EXISTS game_device_performance (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  hardware_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  device_slug TEXT NOT NULL,
  device_model TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  revision INTEGER NOT NULL DEFAULT 1,
  superseded_at TEXT,
  information_status TEXT NOT NULL DEFAULT 'available',
  unavailable_reason TEXT,
  handheld_supported INTEGER,
  handheld_resolution TEXT,
  handheld_rendering_resolution TEXT,
  handheld_output_resolution TEXT,
  handheld_fps TEXT,
  handheld_fps_min TEXT,
  handheld_fps_max TEXT,
  handheld_refresh_rate TEXT,
  handheld_hdr INTEGER,
  handheld_vrr INTEGER,
  handheld_notes TEXT,
  tv_supported INTEGER,
  tv_resolution TEXT,
  tv_rendering_resolution TEXT,
  tv_output_resolution TEXT,
  tv_fps TEXT,
  tv_fps_min TEXT,
  tv_fps_max TEXT,
  tv_refresh_rate TEXT,
  tv_hdr INTEGER,
  tv_vrr INTEGER,
  tv_notes TEXT,
  upscaling TEXT,
  ray_tracing INTEGER,
  ray_tracing_mode TEXT,
  loading_time TEXT,
  loading_notes TEXT,
  game_version TEXT,
  patch_version TEXT,
  tested_date TEXT,
  source_name TEXT,
  source_url TEXT,
  verification_status TEXT,
  verified_at TEXT,
  performance_notes TEXT,
  performance_summary TEXT NOT NULL DEFAULT '',
  data_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_device_performance_modes (
  id TEXT PRIMARY KEY,
  performance_id TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  handheld_resolution TEXT,
  handheld_fps TEXT,
  tv_resolution TEXT,
  tv_fps TEXT,
  hdr INTEGER,
  vrr INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (performance_id) REFERENCES game_device_performance(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS game_device_performance_game_idx
  ON game_device_performance (game_id);
CREATE INDEX IF NOT EXISTS game_device_performance_hardware_idx
  ON game_device_performance (hardware_id);
CREATE INDEX IF NOT EXISTS game_device_performance_game_hardware_idx
  ON game_device_performance (game_id, hardware_id);
CREATE UNIQUE INDEX IF NOT EXISTS game_device_performance_active_unique_idx
  ON game_device_performance (game_id, hardware_id) WHERE active = 1;
CREATE INDEX IF NOT EXISTS game_device_performance_device_slug_idx
  ON game_device_performance (device_slug, active);
CREATE INDEX IF NOT EXISTS game_device_performance_verified_idx
  ON game_device_performance (verified_at DESC);
CREATE INDEX IF NOT EXISTS game_device_performance_modes_parent_idx
  ON game_device_performance_modes (performance_id, display_order);
