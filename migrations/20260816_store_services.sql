CREATE TABLE IF NOT EXISTS product_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  request_type TEXT NOT NULL,
  product_name TEXT NOT NULL,
  game_id TEXT,
  platform TEXT,
  product_category TEXT,
  reference_url TEXT,
  notes TEXT,
  preferred_version TEXT,
  preferred_region TEXT,
  contact_method TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  admin_note TEXT,
  user_visible_note TEXT,
  linked_product_id TEXT,
  status_history TEXT DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS product_requests_user_idx ON product_requests(user_id);
CREATE INDEX IF NOT EXISTS product_requests_status_idx ON product_requests(status);
