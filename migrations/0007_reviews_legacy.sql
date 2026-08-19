-- Product reviews + legacy account fields imported from the old platform.
-- Apply with: bunx wrangler d1 migrations apply banana-store --remote

CREATE TABLE IF NOT EXISTS product_reviews (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  order_id   TEXT,
  rating     INTEGER NOT NULL DEFAULT 5,
  comment    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'approved',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS product_reviews_product_idx ON product_reviews (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS product_reviews_user_idx ON product_reviews (user_id, created_at DESC);

-- legacy wallet balance (IQD) and an AES-GCM encrypted archive of contact data
ALTER TABLE users ADD COLUMN wallet_iqd INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN contact_enc TEXT;
ALTER TABLE users ADD COLUMN legacy_id TEXT;
ALTER TABLE users ADD COLUMN must_reset_password INTEGER NOT NULL DEFAULT 0;
