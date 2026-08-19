-- Background/theme packs. The built-in catalogue lives in src/lib/themes.ts;
-- this table exists so the admin can author extra packs later (colours per
-- button / card / background / text) without a code change.
CREATE TABLE IF NOT EXISTS theme_packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_dark INTEGER NOT NULL DEFAULT 0,
  is_free INTEGER NOT NULL DEFAULT 0,
  cost INTEGER NOT NULL DEFAULT 0,
  reward_id TEXT,
  tokens TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO theme_packs (id, name, is_dark, is_free, cost, reward_id, sort_order) VALUES
  ('cream',    'كريمي (نينتندو)', 0, 1, 0,    NULL,        1),
  ('midnight', 'ليلي موزي',       1, 1, 0,    NULL,        2),
  ('space',    'الفضاء',          1, 0, 500,  'rw-space',  3),
  ('banana',   'سوق الموز',       0, 0, 1000, 'rw-banana', 4),
  ('cyber',    'سايبربانك',       1, 0, 800,  'rw-cyber',  5);
