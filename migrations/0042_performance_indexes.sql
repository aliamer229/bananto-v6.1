-- Performance optimization indexes for D1
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_code_idx ON orders (code);
CREATE INDEX IF NOT EXISTS threads_order_idx ON threads (order_id);
CREATE INDEX IF NOT EXISTS threads_last_msg_idx ON threads (last_message_at DESC);
CREATE INDEX IF NOT EXISTS users_phone_idx ON users (phone);
CREATE INDEX IF NOT EXISTS users_created_idx ON users (created_at DESC);
CREATE INDEX IF NOT EXISTS banana_listings_status_created_idx ON banana_listings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS digital_delivery_items_order_status_idx ON digital_delivery_items (order_id, status);
