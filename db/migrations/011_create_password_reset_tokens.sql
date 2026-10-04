-- One-time password reset links (src/lib/password-reset.ts). Only the SHA-256 of the random token
-- is stored; the raw token exists only in the emailed link. A token is valid until expires_at
-- (an hour after it's created) unless used_at is set. Resetting the password marks the token used
-- and deletes the user's other tokens.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Hex SHA-256 of the token.
  token_hash  text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_created_at_idx ON password_reset_tokens (user_id, created_at);
