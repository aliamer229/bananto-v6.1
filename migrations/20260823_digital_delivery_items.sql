-- Canonical, server-owned digital delivery state.
--
-- The order JSON remains for backwards compatibility, but credentials and
-- fulfillment progress are no longer inferred from chat messages or shared
-- OrderItem fields.  Every quantity-expanded delivery slot has its own row.

ALTER TABLE orders ADD COLUMN last_otp_sent_at TEXT;
ALTER TABLE orders ADD COLUMN auto_complete_at TEXT;
ALTER TABLE orders ADD COLUMN customer_confirmed_at TEXT;
ALTER TABLE orders ADD COLUMN auto_completed_at TEXT;
ALTER TABLE orders ADD COLUMN delivery_issue_opened_at TEXT;

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_title TEXT NOT NULL CHECK (length(trim(product_title)) > 0),
  kind TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 99),
  unit_price REAL NOT NULL DEFAULT 0,
  image_url TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS order_items_order_idx
  ON order_items (order_id, id);
CREATE INDEX IF NOT EXISTS order_items_product_idx
  ON order_items (product_id, order_id);

CREATE TABLE IF NOT EXISTS order_delivery_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  order_item_id TEXT,
  product_id TEXT,
  slot_number INTEGER,
  kind TEXT NOT NULL DEFAULT 'account',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN (
      'draft', 'needs_mapping', 'ready', 'sent',
      'proof_received', 'otp_sent', 'completed'
    )
  ),
  username TEXT,
  password_enc TEXT,
  detected_game TEXT,
  match_confidence REAL,
  source_fingerprint TEXT,
  sent_at TEXT,
  proof_received_at TEXT,
  proof_url TEXT,
  otp_sent_at TEXT,
  completed_at TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (status = 'needs_mapping' AND order_item_id IS NULL) OR
    (status <> 'needs_mapping')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS order_delivery_items_slot_idx
  ON order_delivery_items (order_id, order_item_id, slot_number)
  WHERE archived_at IS NULL AND order_item_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS order_delivery_items_source_idx
  ON order_delivery_items (order_id, source_fingerprint)
  WHERE archived_at IS NULL AND source_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_delivery_items_order_status_idx
  ON order_delivery_items (order_id, status, archived_at);
CREATE INDEX IF NOT EXISTS order_delivery_items_due_idx
  ON order_delivery_items (otp_sent_at, order_id);

CREATE TABLE IF NOT EXISTS order_delivery_issues (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  delivery_item_id TEXT,
  opened_by_user_id TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by_user_id TEXT
);

CREATE INDEX IF NOT EXISTS order_delivery_issues_open_idx
  ON order_delivery_issues (order_id, status, created_at);

-- Some older installations created the queue from the runtime bootstrap rather
-- than an early migration.  Keeping this idempotent makes the cleanup portable.
CREATE TABLE IF NOT EXISTS order_queue (
  id TEXT PRIMARY KEY,
  order_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  assigned_staff_id TEXT,
  user_last_seen_at TEXT,
  admin_last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- This immutable checkout relation already exists in the runtime bootstrap on
-- production. Defining it here makes the migration self-contained and lets the
-- canonical title backfill read the real order/product snapshot directly.
CREATE TABLE IF NOT EXISTS order_items_snapshot (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  title TEXT NOT NULL,
  price_iqd INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  options_json TEXT DEFAULT '{}',
  image_url TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS order_items_snapshot_order_idx
  ON order_items_snapshot (order_id);

-- Backfill from the checkout-validated D1 snapshot joined by order/product.
-- The immutable order document is used only when an older checkout committed
-- the order but its snapshot insert failed. Invalid/blank titles are skipped;
-- the API logs and refuses to render those instead of showing an empty field.
INSERT OR IGNORE INTO order_items (
  id, order_id, product_id, product_title, kind, quantity, unit_price,
  image_url, metadata_json, created_at, updated_at
)
SELECT
  CAST(json_extract(item.value, '$.id') AS TEXT),
  o.id,
  CAST(json_extract(item.value, '$.productId') AS TEXT),
  COALESCE(
    NULLIF(trim(snapshot.title), ''),
    trim(CAST(json_extract(item.value, '$.title') AS TEXT))
  ),
  COALESCE(CAST(json_extract(item.value, '$.kind') AS TEXT), 'account'),
  MIN(99, MAX(1, COALESCE(CAST(json_extract(item.value, '$.quantity') AS INTEGER), 1))),
  COALESCE(CAST(json_extract(item.value, '$.unitPrice') AS REAL), 0),
  CAST(json_extract(item.value, '$.image') AS TEXT),
  COALESCE(json_extract(item.value, '$.meta'), '{}'),
  o.created_at,
  o.updated_at
FROM orders AS o, json_each(o.doc, '$.items') AS item
LEFT JOIN (
  SELECT order_id, product_id, title
  FROM (
    SELECT
      order_id,
      CAST(product_id AS TEXT) AS product_id,
      title,
      ROW_NUMBER() OVER (
        PARTITION BY order_id, CAST(product_id AS TEXT)
        ORDER BY created_at ASC, id ASC
      ) AS row_number
    FROM order_items_snapshot
    WHERE length(trim(title)) > 0
  )
  WHERE row_number = 1
) AS snapshot
  ON snapshot.order_id = o.id
 AND snapshot.product_id = CAST(json_extract(item.value, '$.productId') AS TEXT)
WHERE json_valid(o.doc) = 1
  AND json_extract(item.value, '$.id') IS NOT NULL
  AND json_extract(item.value, '$.productId') IS NOT NULL
  AND length(trim(COALESCE(
    snapshot.title,
    CAST(json_extract(item.value, '$.title') AS TEXT),
    ''
  ))) > 0;

-- Expand quantity into independent delivery rows. Legacy evidence can safely
-- seed only slot 1; no historical shared field is copied into additional slots.
WITH RECURSIVE slot_numbers(slot_number) AS (
  SELECT 1
  UNION ALL
  SELECT slot_number + 1 FROM slot_numbers WHERE slot_number < 99
)
INSERT OR IGNORE INTO order_delivery_items (
  id, order_id, order_item_id, product_id, slot_number, kind, status,
  username, password_enc, sent_at, proof_received_at, proof_url, otp_sent_at,
  completed_at, created_at, updated_at
)
SELECT
  oi.id || ':delivery:' || slot_numbers.slot_number,
  oi.order_id,
  oi.id,
  oi.product_id,
  slot_numbers.slot_number,
  oi.kind,
  CASE
    WHEN json_extract(o.doc, '$.status') = 'completed' THEN 'completed'
    WHEN slot_numbers.slot_number = 1
      AND json_extract(item.value, '$.verificationCodeSentAt') IS NOT NULL THEN 'otp_sent'
    WHEN slot_numbers.slot_number = 1
      AND json_extract(item.value, '$.loginProofAt') IS NOT NULL THEN 'proof_received'
    WHEN slot_numbers.slot_number = 1
      AND json_extract(item.value, '$.credsSentAt') IS NOT NULL THEN 'sent'
    WHEN slot_numbers.slot_number = 1
      AND length(trim(COALESCE(CAST(json_extract(item.value, '$.deliveryEmail') AS TEXT), ''))) > 0
      AND length(trim(COALESCE(CAST(json_extract(item.value, '$.deliveryPasswordEnc') AS TEXT), ''))) > 0
      THEN 'ready'
    ELSE 'draft'
  END,
  CASE WHEN slot_numbers.slot_number = 1
    THEN CAST(json_extract(item.value, '$.deliveryEmail') AS TEXT) END,
  CASE WHEN slot_numbers.slot_number = 1
    THEN CAST(json_extract(item.value, '$.deliveryPasswordEnc') AS TEXT) END,
  CASE WHEN slot_numbers.slot_number = 1
    THEN CAST(json_extract(item.value, '$.credsSentAt') AS TEXT) END,
  CASE WHEN slot_numbers.slot_number = 1
    THEN CAST(json_extract(item.value, '$.loginProofAt') AS TEXT) END,
  CASE WHEN slot_numbers.slot_number = 1
    THEN CAST(json_extract(item.value, '$.loginProofUrl') AS TEXT) END,
  CASE WHEN slot_numbers.slot_number = 1
    THEN CAST(json_extract(item.value, '$.verificationCodeSentAt') AS TEXT) END,
  CASE WHEN json_extract(o.doc, '$.status') = 'completed'
    THEN COALESCE(
      CAST(json_extract(item.value, '$.completedAt') AS TEXT),
      CAST(json_extract(o.doc, '$.completedAt') AS TEXT),
      o.updated_at
    ) END,
  o.created_at,
  o.updated_at
FROM order_items AS oi
JOIN orders AS o ON o.id = oi.order_id
JOIN json_each(o.doc, '$.items') AS item
  ON CAST(json_extract(item.value, '$.id') AS TEXT) = oi.id
JOIN slot_numbers ON slot_numbers.slot_number <= oi.quantity
WHERE oi.kind NOT IN ('hardware', 'physical', 'accessory', 'device', 'collectible');

-- Establish an explicit server timestamp only when every expected slot has a
-- final OTP/completion. Drafts, sent credentials and proof alone never qualify.
UPDATE orders
SET last_otp_sent_at = (
  SELECT MAX(di.otp_sent_at)
  FROM order_delivery_items AS di
  WHERE di.order_id = orders.id AND di.archived_at IS NULL
)
WHERE last_otp_sent_at IS NULL
  AND EXISTS (
    SELECT 1 FROM order_delivery_items AS di
    WHERE di.order_id = orders.id AND di.archived_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM order_delivery_items AS di
    WHERE di.order_id = orders.id
      AND di.archived_at IS NULL
      AND di.status NOT IN ('otp_sent', 'completed')
  )
  AND EXISTS (
    SELECT 1 FROM order_delivery_items AS di
    WHERE di.order_id = orders.id
      AND di.archived_at IS NULL
      AND di.otp_sent_at IS NOT NULL
  );

UPDATE orders
SET auto_complete_at = strftime('%Y-%m-%dT%H:%M:%fZ', last_otp_sent_at, '+60 minutes')
WHERE auto_complete_at IS NULL AND last_otp_sent_at IS NOT NULL;

-- A legacy escalated/needs-admin thread is an existing delivery problem, not a
-- candidate for timeout completion. Move it to review and cancel the deadline.
UPDATE orders
SET
  status = 'delivery_issue',
  doc = json_set(
    doc,
    '$.status', 'delivery_issue',
    '$.lastOtpSentAt', last_otp_sent_at,
    '$.autoCompleteAt', NULL,
    '$.deliveryIssueOpenedAt', COALESCE(
      delivery_issue_opened_at,
      strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    ),
    '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  delivery_issue_opened_at = COALESCE(
    delivery_issue_opened_at,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  auto_complete_at = NULL,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE json_extract(doc, '$.status') IN (
    'waiting_for_user', 'delivering', 'processing', 'awaiting_customer_confirmation'
  )
  AND last_otp_sent_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM order_delivery_items AS di
    WHERE di.order_id = orders.id
      AND di.archived_at IS NULL
      AND di.status NOT IN ('otp_sent', 'completed')
  )
  AND (
    EXISTS (
      SELECT 1 FROM threads AS thread
      WHERE thread.order_id = orders.id
        AND (
          json_extract(thread.doc, '$.needsAdmin') = 1 OR
          json_extract(thread.doc, '$.mode') = 'ESCALATED'
        )
    )
    OR EXISTS (
      SELECT 1 FROM order_delivery_issues AS issue
      WHERE issue.order_id = orders.id AND issue.status = 'open'
    )
  );

-- Safe historical cleanup.  A thread already escalated to an admin is treated
-- as an open problem even if it predates order_delivery_issues.
UPDATE orders
SET
  status = 'completed',
  doc = json_set(
    doc,
    '$.status', 'completed',
    '$.completedAt', COALESCE(json_extract(doc, '$.completedAt'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    '$.autoCompletedAt', COALESCE(json_extract(doc, '$.autoCompletedAt'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    '$.lastOtpSentAt', last_otp_sent_at,
    '$.autoCompleteAt', NULL,
    '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  auto_completed_at = COALESCE(auto_completed_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  auto_complete_at = NULL,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE json_extract(doc, '$.status') IN ('waiting_for_user', 'delivering', 'processing', 'awaiting_customer_confirmation')
  AND auto_complete_at IS NOT NULL
  AND julianday(auto_complete_at) <= julianday('now')
  AND delivery_issue_opened_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM order_delivery_issues AS issue
    WHERE issue.order_id = orders.id AND issue.status = 'open'
  )
  AND NOT EXISTS (
    SELECT 1 FROM threads AS thread
    WHERE thread.order_id = orders.id
      AND (
        json_extract(thread.doc, '$.needsAdmin') = 1 OR
        json_extract(thread.doc, '$.mode') = 'ESCALATED'
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM order_delivery_items AS di
    WHERE di.order_id = orders.id
      AND di.archived_at IS NULL
      AND di.status NOT IN ('otp_sent', 'completed')
  );

UPDATE order_delivery_items
SET status = 'completed', completed_at = COALESCE(completed_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), revision = revision + 1
WHERE archived_at IS NULL
  AND status = 'otp_sent'
  AND order_id IN (
    SELECT id FROM orders WHERE json_extract(doc, '$.status') = 'completed'
  );

-- Recent legacy deliveries leave the preparation queue immediately but keep
-- the customer's one-hour confirmation window.
UPDATE orders
SET
  status = 'awaiting_customer_confirmation',
  doc = json_set(
    doc,
    '$.status', 'awaiting_customer_confirmation',
    '$.lastOtpSentAt', last_otp_sent_at,
    '$.autoCompleteAt', auto_complete_at,
    '$.updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE json_extract(doc, '$.status') IN ('waiting_for_user', 'delivering', 'processing')
  AND auto_complete_at IS NOT NULL
  AND julianday(auto_complete_at) > julianday('now')
  AND delivery_issue_opened_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM order_delivery_issues AS issue
    WHERE issue.order_id = orders.id AND issue.status = 'open'
  )
  AND NOT EXISTS (
    SELECT 1 FROM order_delivery_items AS di
    WHERE di.order_id = orders.id
      AND di.archived_at IS NULL
      AND di.status NOT IN ('otp_sent', 'completed')
  );

UPDATE order_queue
SET status = 'completed', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE order_id IN (
  SELECT id FROM orders
  WHERE json_extract(doc, '$.status') IN (
    'awaiting_customer_confirmation', 'delivery_issue', 'completed'
  )
);
