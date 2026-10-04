-- Newsletter sign-ups (src/lib/newsletter.ts). One row per address, matched case-insensitively.
-- Unsubscribing keeps the row with status 'unsubscribed'; subscribing again flips it back. Only
-- the SHA-256 of the unsubscribe token is stored: the raw token exists only in the link of the
-- latest confirmation email, and each new confirmation replaces it. confirmation_sent_at throttles
-- repeated sign-ups of one address.
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                   text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  status                  text NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed', 'unsubscribed')),
  -- Where the latest sign-up came from, e.g. 'home' or 'register'.
  source                  text NOT NULL CHECK (source ~ '^[a-z-]{1,30}$'),
  -- Hex SHA-256 of the unsubscribe token.
  unsubscribe_token_hash  text NOT NULL UNIQUE CHECK (unsubscribe_token_hash ~ '^[0-9a-f]{64}$'),
  confirmation_sent_at    timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_email_key ON newsletter_subscribers (lower(email));
CREATE INDEX IF NOT EXISTS newsletter_subscribers_status_created_at_idx ON newsletter_subscribers (status, created_at);
