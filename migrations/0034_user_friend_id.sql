-- Add Nintendo friend_id and email_verified_at to users
-- Apply with: wrangler d1 migrations apply banan-d1 --remote

ALTER TABLE users ADD COLUMN friend_id TEXT;
ALTER TABLE users ADD COLUMN email_verified_at TEXT;
