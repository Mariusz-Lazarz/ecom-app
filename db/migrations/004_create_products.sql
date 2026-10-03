-- Trigram indexes let the catalogue's `ILIKE '%term%'` search use an index instead of a full scan.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS products (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text NOT NULL UNIQUE,
  name              text NOT NULL,
  brand             text NOT NULL,
  category_id       uuid NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  short_description text NOT NULL,
  description       text NOT NULL,
  price_cents       integer NOT NULL CHECK (price_cents >= 0),
  -- The "was" price. A product is on sale when this is above price_cents.
  compare_at_cents  integer CHECK (compare_at_cents IS NULL OR compare_at_cents > price_cents),
  currency          text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  stock             integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  rating            numeric(2, 1) NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  review_count      integer NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  -- Short label shown on the product card, e.g. 'New' or 'Bestseller'.
  badge             text,
  featured          boolean NOT NULL DEFAULT false,
  -- Ordered rows of the spec table: [{ "label": "Weight", "value": "250 g" }, ...]
  specs             jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(specs) = 'array'),
  -- Everything the catalogue search matches against, kept in one column so one index covers it.
  search_text       text GENERATED ALWAYS AS (name || ' ' || brand || ' ' || short_description || ' ' || description) STORED,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_category_id_idx ON products (category_id);
CREATE INDEX IF NOT EXISTS products_created_at_idx ON products (created_at DESC);
CREATE INDEX IF NOT EXISTS products_price_cents_idx ON products (price_cents);
CREATE INDEX IF NOT EXISTS products_rating_idx ON products (rating DESC, review_count DESC);
CREATE INDEX IF NOT EXISTS products_featured_idx ON products (rating DESC) WHERE featured;
CREATE INDEX IF NOT EXISTS products_search_text_trgm_idx ON products USING gin (search_text gin_trgm_ops);

CREATE TABLE IF NOT EXISTS product_images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  -- Object key in the media bucket (e.g. products/<sha256>.webp). The public URL is derived from
  -- MEDIA_PUBLIC_URL when read, so moving the CDN doesn't require rewriting rows.
  storage_key text NOT NULL,
  width       integer NOT NULL CHECK (width > 0),
  height      integer NOT NULL CHECK (height > 0),
  alt         text NOT NULL,
  -- 0 is the primary image shown on product cards.
  position    integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  UNIQUE (product_id, position)
);
