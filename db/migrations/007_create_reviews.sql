-- Product reviews: one per customer per product, editable by its author. Only customers with a
-- delivered order containing the product may write one (enforced in src/lib/reviews.ts).
CREATE TABLE IF NOT EXISTS reviews (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rating     smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title      text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  -- 'hidden' reviews are kept but left out of the storefront and the product's aggregates.
  status     text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  -- Set when written: true when the author had a delivered order containing the product.
  verified   boolean NOT NULL DEFAULT false,
  -- Written by `npm run db:seed`, which replaces these rows on every run. Editing a seeded review
  -- makes it a real one.
  seeded     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);

-- The UNIQUE constraint covers lookups by product; these serve the product page's sorts, the
-- user's own reviews (order page, cascade) and the admin list.
CREATE INDEX IF NOT EXISTS reviews_product_status_created_at_idx ON reviews (product_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_user_id_idx ON reviews (user_id);
CREATE INDEX IF NOT EXISTS reviews_created_at_idx ON reviews (created_at DESC);

-- products.rating and products.review_count are the average (one decimal) and count of the
-- product's published reviews. They are kept as columns so listings can sort and show them
-- cheaply, and this trigger keeps them current in the same transaction as every review insert,
-- edit, moderation or delete (cascades from a deleted user included).
CREATE OR REPLACE FUNCTION refresh_product_rating(target uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  -- Concurrent review writes for one product queue on the product row; the UPDATE below then runs
  -- with a fresh snapshot that includes whatever the previous writer committed.
  PERFORM 1 FROM products WHERE id = target FOR UPDATE;
  UPDATE products p
  SET rating = COALESCE(s.average, 0), review_count = s.total
  FROM (
    SELECT round(avg(rating)::numeric, 1) AS average, count(*)::int AS total
    FROM reviews WHERE product_id = target AND status = 'published'
  ) s
  WHERE p.id = target AND (p.rating, p.review_count) IS DISTINCT FROM (COALESCE(s.average, 0), s.total);
END
$$;

CREATE OR REPLACE FUNCTION reviews_refresh_product_rating() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM refresh_product_rating(OLD.product_id);
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.product_id <> OLD.product_id) THEN
    PERFORM refresh_product_rating(NEW.product_id);
  END IF;
  RETURN NULL;
END
$$;

CREATE OR REPLACE TRIGGER reviews_refresh_product_rating
AFTER INSERT OR DELETE OR UPDATE OF product_id, rating, status ON reviews
FOR EACH ROW EXECUTE FUNCTION reviews_refresh_product_rating();

-- Bring every product in line with its reviews (a no-op once they agree).
UPDATE products p
SET rating = COALESCE(s.average, 0), review_count = COALESCE(s.total, 0)
FROM products p2
LEFT JOIN (
  SELECT product_id, round(avg(rating)::numeric, 1) AS average, count(*)::int AS total
  FROM reviews WHERE status = 'published' GROUP BY product_id
) s ON s.product_id = p2.id
WHERE p.id = p2.id
  AND (p.rating, p.review_count) IS DISTINCT FROM (COALESCE(s.average, 0), COALESCE(s.total, 0));
