-- The admin products listing, as an indexed table.
--
-- The catalogue itself stays in store_kv: it is one JSON document split into
-- store:products#NNN chunks plus per-product overlay rows, and rewriting that
-- into relational tables would touch every product, order line and relation.
-- This is a projection of it — only the columns the admin table renders —
-- written in the same D1 batch as the catalogue by persistStore, and
-- rebuildable from the document at any time. Dropping it costs one rebuild and
-- loses nothing.
CREATE TABLE IF NOT EXISTS product_index (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL DEFAULT '',
  title         TEXT NOT NULL DEFAULT '',
  title_en      TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT '',
  category_id   TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL DEFAULT '',
  schema_id     TEXT NOT NULL DEFAULT '',
  platform      TEXT NOT NULL DEFAULT '',
  price         REAL,
  cost          REAL,
  stock         INTEGER,
  infinite_stock INTEGER NOT NULL DEFAULT 0,
  hidden        INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT '',
  sales         INTEGER NOT NULL DEFAULT 0,
  image         TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT '',
  release_date  TEXT NOT NULL DEFAULT '',
  -- Folded title key, so ORDER BY here matches the browser's Arabic collator.
  sort_name     TEXT NOT NULL DEFAULT '',
  -- Epoch milliseconds, so "last edited" orders numerically across the several
  -- date spellings the catalogue carries.
  sort_updated  INTEGER,
  sort_release  INTEGER,
  -- COALESCE(release, updated, 0), stored rather than computed so the default
  -- ordering can use an index instead of sorting the whole table.
  sort_rank     INTEGER NOT NULL DEFAULT 0,
  -- A Switch 2 game whose performance data is still incomplete.
  performance_required INTEGER NOT NULL DEFAULT 0,
  rev           INTEGER NOT NULL DEFAULT 0
);

-- One index per column *and direction*, each declaring the same leading
-- expression as the ORDER BY it serves. Missing values sort last in both
-- directions, so the ORDER BY leads with `price IS NULL`; an index without that
-- expression cannot serve it and SQLite sorts the whole table for one page.
CREATE INDEX IF NOT EXISTS idx_pi_updated_desc ON product_index (sort_updated IS NULL, sort_updated DESC, id);
CREATE INDEX IF NOT EXISTS idx_pi_updated_asc  ON product_index (sort_updated IS NULL, sort_updated, id);
CREATE INDEX IF NOT EXISTS idx_pi_price_desc   ON product_index (price IS NULL, price DESC, id);
CREATE INDEX IF NOT EXISTS idx_pi_price_asc    ON product_index (price IS NULL, price, id);
CREATE INDEX IF NOT EXISTS idx_pi_name_desc    ON product_index (sort_name = '', sort_name DESC, id);
CREATE INDEX IF NOT EXISTS idx_pi_name_asc     ON product_index (sort_name = '', sort_name, id);
CREATE INDEX IF NOT EXISTS idx_pi_rank_desc    ON product_index (display_order DESC, sort_rank DESC, id);
CREATE INDEX IF NOT EXISTS idx_pi_rank_asc     ON product_index (display_order, sort_rank, id);
CREATE INDEX IF NOT EXISTS idx_pi_category     ON product_index (category_id, display_order DESC);
CREATE INDEX IF NOT EXISTS idx_pi_hidden       ON product_index (hidden, sort_updated DESC);
