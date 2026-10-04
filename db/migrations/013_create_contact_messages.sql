-- Messages sent through the contact form (src/lib/contact.ts), read by admins at /admin/messages.
-- user_id is set when the sender was signed in; order_number is stored as typed (upper-cased) and,
-- for a signed-in sender, has been checked to be one of their orders. ip_hash (SHA-256 of the
-- client IP) and the email only serve the rate limit: one message per address or IP a minute.
CREATE TABLE IF NOT EXISTS contact_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES users (id) ON DELETE SET NULL,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  email         text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  order_number  text CHECK (char_length(order_number) BETWEEN 1 AND 30),
  topic         text NOT NULL CHECK (topic IN ('order', 'returns', 'shipping', 'payment', 'product', 'other')),
  message       text NOT NULL CHECK (char_length(message) BETWEEN 10 AND 2000),
  status        text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'archived')),
  ip_hash       text CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_messages_status_created_at_idx ON contact_messages (status, created_at);
CREATE INDEX IF NOT EXISTS contact_messages_created_at_idx ON contact_messages (created_at);
CREATE INDEX IF NOT EXISTS contact_messages_email_created_at_idx ON contact_messages (lower(email), created_at);
CREATE INDEX IF NOT EXISTS contact_messages_ip_hash_created_at_idx ON contact_messages (ip_hash, created_at) WHERE ip_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS contact_messages_user_id_idx ON contact_messages (user_id) WHERE user_id IS NOT NULL;
