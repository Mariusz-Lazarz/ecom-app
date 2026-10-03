-- Shipping addresses a customer saved to their account, to pick at checkout. Orders never point
-- here: they snapshot the address, so editing or deleting one leaves past orders alone. The limit
-- per user (MAX_ADDRESSES) is enforced in src/lib/addresses.ts.
CREATE TABLE IF NOT EXISTS addresses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- A name for the address, e.g. "Home" or "Office".
  label       text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 40),
  full_name   text NOT NULL,
  line1       text NOT NULL,
  line2       text,
  city        text NOT NULL,
  postal_code text NOT NULL,
  country     text NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  phone       text NOT NULL,
  -- The one checkout preselects. At most one per user (index below).
  is_default  boolean NOT NULL DEFAULT false,
  -- clock_timestamp(), so addresses saved in one transaction still keep their order.
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS addresses_user_id_created_at_idx ON addresses (user_id, created_at);

-- At most one default address per user.
CREATE UNIQUE INDEX IF NOT EXISTS addresses_one_default_per_user_idx ON addresses (user_id) WHERE is_default;
