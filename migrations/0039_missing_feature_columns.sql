-- Columns the application writes but that no earlier migration created.
-- Without them the disc-trade submission, the trade payout credit, the banana
-- market buyer link and the legacy claim lock all failed at runtime.
-- Mirrored in SCHEMA_PATCHES (src/lib/d1.server.ts) for databases bootstrapped
-- outside `wrangler d1 migrations apply`.

ALTER TABLE disc_trades ADD COLUMN box_condition TEXT;
ALTER TABLE disc_trades ADD COLUMN region TEXT;
ALTER TABLE disc_trades ADD COLUMN accessories TEXT DEFAULT '[]';
ALTER TABLE disc_trades ADD COLUMN damage TEXT;
ALTER TABLE disc_trades ADD COLUMN shipping_option TEXT;
ALTER TABLE disc_trades ADD COLUMN payout_credited INTEGER NOT NULL DEFAULT 0;
ALTER TABLE disc_trades ADD COLUMN payout_credited_at TEXT;
ALTER TABLE disc_trades ADD COLUMN payout_amount_credited INTEGER;

ALTER TABLE banana_market_offers ADD COLUMN buyer_id TEXT;
ALTER TABLE banana_redemption_offers ADD COLUMN updated_at TEXT;
ALTER TABLE legacy_users ADD COLUMN claim_started_at TEXT;

ALTER TABLE game_records ADD COLUMN game_is_offline INTEGER;
ALTER TABLE game_records ADD COLUMN game_is_online INTEGER;
ALTER TABLE game_records ADD COLUMN game_language_locked INTEGER;

-- Per-step checkpoints for claimLegacyAccount. Without them the claim
-- re-imported every order, thread and review on each sign-in.
ALTER TABLE legacy_claims ADD COLUMN banana_done INTEGER NOT NULL DEFAULT 0;
ALTER TABLE legacy_claims ADD COLUMN orders_done INTEGER NOT NULL DEFAULT 0;
ALTER TABLE legacy_claims ADD COLUMN threads_done INTEGER NOT NULL DEFAULT 0;
ALTER TABLE legacy_claims ADD COLUMN reviews_done INTEGER NOT NULL DEFAULT 0;
ALTER TABLE legacy_claims ADD COLUMN media_done INTEGER NOT NULL DEFAULT 0;
ALTER TABLE legacy_claims ADD COLUMN created_at TEXT;
