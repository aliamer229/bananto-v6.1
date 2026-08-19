-- Add client_message_id column for idempotency
ALTER TABLE messages ADD COLUMN client_message_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS messages_client_msg_idx ON messages (thread_id, client_message_id) WHERE client_message_id IS NOT NULL;
