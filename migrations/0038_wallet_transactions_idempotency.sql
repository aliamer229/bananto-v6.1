-- Add reference_type and reference_id for idempotency
ALTER TABLE wallet_transactions ADD COLUMN reference_type TEXT;
ALTER TABLE wallet_transactions ADD COLUMN reference_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_ref_idx ON wallet_transactions (reference_type, reference_id) WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;
