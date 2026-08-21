-- Audit trail for wallet top-up decisions.
--
-- An approval moves real money into a member's wallet, but the table recorded
-- only the new status: not who decided, not when, and not how much actually
-- landed once the Nintendo bonus was applied. There was nothing to check
-- afterwards and no way to build a log of settled requests.
--
-- Mirrored in SCHEMA_PATCHES (src/lib/d1.server.ts) for databases bootstrapped
-- outside `wrangler d1 migrations apply`.

ALTER TABLE recharge_requests ADD COLUMN reviewed_by TEXT;
ALTER TABLE recharge_requests ADD COLUMN reviewed_by_name TEXT;
ALTER TABLE recharge_requests ADD COLUMN reviewed_at TEXT;
ALTER TABLE recharge_requests ADD COLUMN review_source TEXT;
ALTER TABLE recharge_requests ADD COLUMN credited_amount REAL;

CREATE INDEX IF NOT EXISTS recharge_requests_status_idx ON recharge_requests (status, created_at);
CREATE INDEX IF NOT EXISTS recharge_requests_user_idx ON recharge_requests (user_id);

-- Contests can now be created from the bot and published to a channel or a
-- specific group topic, so the target and the author are recorded.
ALTER TABLE telegram_contests ADD COLUMN channel_id TEXT;
ALTER TABLE telegram_contests ADD COLUMN message_thread_id INTEGER;
ALTER TABLE telegram_contests ADD COLUMN created_by TEXT;
