-- Real orders are numbered NC-10001, NC-10002, … from this sequence. Numbers below its minimum
-- (NC-1001 … NC-9999) are reserved for the seed's sample orders, so the two can never collide.
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 10001 MINVALUE 10001;

-- An order snapshots everything at purchase time (address, shipping, payment, money), so later
-- changes to products, prices or the shipping/payment configs never rewrite history. Payment is
-- simulated: a placed order is paid, and no card data is stored.
CREATE TABLE IF NOT EXISTS orders (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number                      text NOT NULL UNIQUE DEFAULT ('NC-' || nextval('order_number_seq')),
  -- RESTRICT: an account with orders can't be deleted and take its order history with it.
  user_id                     uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  -- Allowed changes are enforced in src/lib/orders.ts (ORDER_TRANSITIONS); this only guards the values.
  status                      text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'rejected')),
  full_name                   text NOT NULL,
  line1                       text NOT NULL,
  line2                       text,
  city                        text NOT NULL,
  postal_code                 text NOT NULL,
  country                     text NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  phone                       text NOT NULL,
  shipping_method_id          text NOT NULL,
  shipping_method_name        text NOT NULL,
  -- The method's list price; shipping_cents is what was charged (0 when free shipping applied).
  shipping_method_price_cents integer NOT NULL CHECK (shipping_method_price_cents >= 0),
  payment_method_id           text NOT NULL,
  payment_method_name         text NOT NULL,
  subtotal_cents              integer NOT NULL CHECK (subtotal_cents >= 0),
  savings_cents               integer NOT NULL DEFAULT 0 CHECK (savings_cents >= 0),
  shipping_cents              integer NOT NULL CHECK (shipping_cents >= 0),
  total_cents                 integer NOT NULL CHECK (total_cents = subtotal_cents + shipping_cents),
  currency                    text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  tracking_number             text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_user_id_created_at_idx ON orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_created_at_idx ON orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  -- Kept for restocking and linking back; NULL once the product is deleted (the snapshot stays).
  product_id       uuid REFERENCES products (id) ON DELETE SET NULL,
  -- The line's place in the order (the cart's order at checkout).
  position         integer NOT NULL CHECK (position >= 0),
  product_name     text NOT NULL,
  product_slug     text NOT NULL,
  brand            text NOT NULL,
  -- The primary image's key in the media bucket; the URL is built with mediaUrl() on read.
  image_key        text,
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  compare_at_cents integer CHECK (compare_at_cents IS NULL OR compare_at_cents >= 0),
  quantity         integer NOT NULL CHECK (quantity > 0),
  line_total_cents integer NOT NULL CHECK (line_total_cents = unit_price_cents * quantity),
  UNIQUE (order_id, position)
);

-- The UNIQUE constraint covers lookups by order; this one serves ON DELETE SET NULL for products.
CREATE INDEX IF NOT EXISTS order_items_product_id_idx ON order_items (product_id);

-- Every status an order has been in, starting with the initial 'pending', and who set it.
CREATE TABLE IF NOT EXISTS order_status_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  status        text NOT NULL
                CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'rejected')),
  actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  actor_role    text NOT NULL CHECK (actor_role IN ('customer', 'admin', 'system')),
  note          text,
  -- clock_timestamp(), so events written in one transaction still keep their order.
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS order_status_events_order_id_idx ON order_status_events (order_id, created_at);
CREATE INDEX IF NOT EXISTS order_status_events_actor_user_id_idx ON order_status_events (actor_user_id);
