-- Account handles, membership numbers and optional profile fields.
-- Apply with: bunx wrangler d1 migrations apply banana-store --remote

ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN member_no TEXT;
ALTER TABLE users ADD COLUMN gender TEXT;
ALTER TABLE users ADD COLUMN birth_date TEXT;
ALTER TABLE users ADD COLUMN preferred_genres TEXT NOT NULL DEFAULT '[]';
ALTER TABLE users ADD COLUMN profile_completed_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users (username);
CREATE UNIQUE INDEX IF NOT EXISTS users_member_no_idx ON users (member_no);
