-- Products a signed-in customer saved for later. Only the pair is stored: price, sale and stock are
-- read live from products. Deleting the user or the product removes the row.
CREATE TABLE IF NOT EXISTS wishlist_items (
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  -- clock_timestamp() rather than now(), so items saved in one transaction still keep their order.
  added_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, product_id)
);

-- The primary key covers lookups by user; this one serves the cascade when a product is deleted.
CREATE INDEX IF NOT EXISTS wishlist_items_product_id_idx ON wishlist_items (product_id);
