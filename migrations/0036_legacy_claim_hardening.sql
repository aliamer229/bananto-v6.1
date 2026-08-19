-- Legacy Claim Hardening & Attempt History Migration
-- Ensures idempotent retries, attempt tracking, error codes without PII, and timeline auditing.

ALTER TABLE legacy_claims ADD COLUMN attempts INTEGER NOT NULL DEFAULT 1;
ALTER TABLE legacy_claims ADD COLUMN last_error_code TEXT;
ALTER TABLE legacy_claims ADD COLUMN updated_at TEXT;
ALTER TABLE legacy_claims ADD COLUMN completed_at TEXT;

CREATE TABLE IF NOT EXISTS legacy_claim_attempts (
  id TEXT PRIMARY KEY,
  legacy_user_id TEXT NOT NULL,
  claimed_by_user_id TEXT NOT NULL,
  claim_type TEXT NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_legacy_claim_attempts_legacy ON legacy_claim_attempts(legacy_user_id);
CREATE INDEX IF NOT EXISTS idx_legacy_claim_attempts_user ON legacy_claim_attempts(claimed_by_user_id);
