CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name    text NOT NULL,
  last_name     text NOT NULL,
  email         text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Emails are stored lowercased, but the index guards against case-only duplicates too.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email));
