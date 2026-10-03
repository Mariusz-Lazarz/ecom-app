-- A cart belongs either to a signed-in user (user_id set, one cart per user) or to a guest, whose
-- browser holds the cart id in the httpOnly `cart_id` cookie (user_id NULL).
CREATE TABLE IF NOT EXISTS carts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only product and quantity: price, sale and stock are always read live from products.
CREATE TABLE IF NOT EXISTS cart_items (
  cart_id    uuid NOT NULL REFERENCES carts (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  quantity   integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  -- clock_timestamp() rather than now(), so lines added in one transaction still keep their order.
  added_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (cart_id, product_id)
);

-- The UNIQUE constraint covers lookups by cart; this one serves the cascade when a product is deleted.
CREATE INDEX IF NOT EXISTS cart_items_product_id_idx ON cart_items (product_id);
