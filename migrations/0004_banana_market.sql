-- Banana Market: wallets, listings, price history, rewards and ledger.
-- Apply with: bunx wrangler d1 migrations apply banana-store --remote

CREATE TABLE IF NOT EXISTS banana_wallets (
  user_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS banana_listings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price_per REAL NOT NULL,
  is_private INTEGER NOT NULL DEFAULT 0,
  is_promoted INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS banana_listings_status_idx ON banana_listings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS banana_listings_user_idx ON banana_listings (user_id, status);

CREATE TABLE IF NOT EXISTS banana_price_points (
  id TEXT PRIMARY KEY,
  price REAL NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS banana_price_points_idx ON banana_price_points (recorded_at);

CREATE TABLE IF NOT EXISTS banana_rewards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  cost INTEGER NOT NULL,
  stock INTEGER NOT NULL DEFAULT -1,
  icon TEXT NOT NULL DEFAULT '🍌',
  category TEXT NOT NULL DEFAULT 'digital',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS banana_redemptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  reward_id TEXT NOT NULL,
  cost INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS banana_redemptions_user_idx ON banana_redemptions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS banana_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS banana_transactions_user_idx ON banana_transactions (user_id, created_at DESC);

-- Opening market price.
INSERT OR IGNORE INTO banana_price_points (id, price, recorded_at)
VALUES ('seed-open', 0.24, '2026-01-01T00:00:00.000Z');

-- Reward catalogue.
INSERT OR IGNORE INTO banana_rewards (id, title, cost, stock, icon, category, sort_order) VALUES
  ('rw-stand',      'حامل يد تحكم إصدار محدود', 4500,  12, '🎮', 'physical',   1),
  ('rw-border',     'إطار ذهبي للصورة الشخصية', 1200,  50, '✨', 'digital',    2),
  ('rw-coupon',     'كوبون خصم 5 دولار',        2000, 100, '🎟️', 'perks',      3),
  ('rw-space',      'خلفية الفضاء',              500,  -1, '🌌', 'background', 4),
  ('rw-banana',     'خلفية سوق الموز',          1000,  -1, '🍌', 'background', 5),
  ('rw-cyber',      'خلفية سايبربانك',           800,  -1, '🌆', 'background', 6),
  ('rw-title',      'لقب مخصص للحساب',         10000,   5, '👑', 'digital',    7),
  ('rw-emoji',      'حزمة رموز حصرية',           300,  -1, '😎', 'digital',    8),
  ('rw-vip',        'دعم VIP',                  5000,  20, '⭐', 'perks',      9);
