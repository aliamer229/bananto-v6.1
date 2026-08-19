-- Migration: 0032_nintendo_trade_pricing.sql
-- Add store offer bonus and trade-in management fields for Nintendo Switch games

ALTER TABLE game_catalog ADD COLUMN store_offer_bonus_iqd INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_catalog ADD COLUMN trade_value_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_catalog ADD COLUMN trade_enabled INTEGER NOT NULL DEFAULT 1;

ALTER TABLE game_price_history ADD COLUMN old_store_bonus_iqd INTEGER;
ALTER TABLE game_price_history ADD COLUMN new_store_bonus_iqd INTEGER;

ALTER TABLE disc_trades ADD COLUMN store_offer_bonus_iqd INTEGER DEFAULT 0;
ALTER TABLE disc_trades ADD COLUMN store_offer_total_iqd INTEGER;
