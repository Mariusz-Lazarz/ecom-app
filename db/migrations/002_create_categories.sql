CREATE TABLE IF NOT EXISTS categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,
  name       text NOT NULL,
  -- lucide-react icon name in kebab-case, mapped to a component in the UI.
  icon       text NOT NULL,
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed the starter catalogue. Upsert so re-running the migrations picks up edits here.
INSERT INTO categories (slug, name, icon, position) VALUES
  ('audio',       'Audio',       'headphones', 1),
  ('watches',     'Watches',     'watch',      2),
  ('footwear',    'Footwear',    'footprints', 3),
  ('cameras',     'Cameras',     'camera',     4),
  ('accessories', 'Accessories', 'glasses',    5),
  ('bags',        'Bags',        'backpack',   6)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, icon = EXCLUDED.icon, position = EXCLUDED.position;
