-- Discount codes customers enter at checkout. The rules for applying one (dates, limits, minimum
-- subtotal, the money) live in src/lib/order-rules.ts; this only guards the values.
CREATE TABLE IF NOT EXISTS discount_codes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored upper-case, so UNIQUE makes codes unique regardless of how they are typed.
  code               text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_-]{3,32}$'),
  description        text NOT NULL DEFAULT '' CHECK (char_length(description) <= 200),
  type               text NOT NULL CHECK (type IN ('percent', 'fixed', 'free_shipping')),
  -- percent: 1–100 (% off the subtotal); fixed: cents off the subtotal; free_shipping: 0.
  value              integer NOT NULL,
  min_subtotal_cents integer NOT NULL DEFAULT 0 CHECK (min_subtotal_cents >= 0),
  -- Usable from starts_at (inclusive) until ends_at (exclusive); NULL means no bound.
  starts_at          timestamptz,
  ends_at            timestamptz,
  -- Redemptions over all customers; NULL is unlimited.
  max_redemptions    integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  -- Redemptions per customer; NULL is unlimited.
  per_user_limit     integer DEFAULT 1 CHECK (per_user_limit IS NULL OR per_user_limit > 0),
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (type = 'percent' AND value BETWEEN 1 AND 100)
    OR (type = 'fixed' AND value > 0)
    OR (type = 'free_shipping' AND value = 0)
  ),
  CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at)
);

-- One row per order that used a code; it counts towards the code's limits. Cancelling or
-- rejecting the order deletes it, which frees the use again.
CREATE TABLE IF NOT EXISTS discount_redemptions (
  -- RESTRICT: a code that has been redeemed can only be deactivated, not deleted.
  code_id      uuid NOT NULL REFERENCES discount_codes (id) ON DELETE RESTRICT,
  order_id     uuid NOT NULL UNIQUE REFERENCES orders (id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- What the code took off the order: subtotal discount plus any shipping it waived.
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS discount_redemptions_code_user_idx ON discount_redemptions (code_id, user_id);
CREATE INDEX IF NOT EXISTS discount_redemptions_user_id_idx ON discount_redemptions (user_id);

-- The code a signed-in customer applied to their cart. Re-checked on every read and at checkout.
ALTER TABLE carts ADD COLUMN IF NOT EXISTS discount_code text;

-- The order's code and what it took off the subtotal, as charged. A free-shipping code shows up
-- as discount_cents 0 with shipping_cents 0.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0;

-- Dropped and re-added on every run, so the definitions here are always the current ones. The
-- total check replaces 006's `orders_check` (total = subtotal + shipping), which predates discounts.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_check;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_discount_cents_check;
ALTER TABLE orders ADD CONSTRAINT orders_discount_cents_check
  CHECK (discount_cents >= 0 AND discount_cents <= subtotal_cents);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_total_cents_check;
ALTER TABLE orders ADD CONSTRAINT orders_total_cents_check
  CHECK (total_cents = subtotal_cents - discount_cents + shipping_cents);
