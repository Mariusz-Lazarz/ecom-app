# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Northcart: a hobby e-commerce storefront built on Next.js 16 (App Router, React 19), Tailwind v4, shadcn/ui (`base-nova` style, built on `@base-ui/react`, **not** Radix), Auth.js v5 (next-auth beta) and raw `pg` against Postgres. There is no ORM.

Work on a branch cut from `dev` (`feature/<short-name>`, `fix/<short-name>`); PRs target `dev`, never `main`.

This Next.js version differs from older ones. For example, middleware is `src/proxy.ts` (exported `proxy` function), and error boundaries receive `retry` rather than `reset`. Check `node_modules/next/dist/docs/` before relying on remembered APIs.

## Commands

```bash
docker compose up -d            # local Postgres 17 + S3Mock media bucket (reads .env / defaults ecom:ecom@localhost:5432/ecom)
cp .env.example .env.local      # needs DATABASE_URL, AUTH_SECRET, SEED_ADMIN_PASSWORD and the S3_* / MEDIA_PUBLIC_URL media vars
npm run db:migrate              # applies every db/migrations/*.sql in name order (idempotent)
npm run db:seed                 # runs the db/seed/ steps (idempotent); admin needs SEED_ADMIN_PASSWORD, products needs the bucket + internet on first run
npm run dev

npm run lint
npx next typegen && npx tsc --noEmit   # typecheck (typegen first, as CI does)
npm test                                # Vitest unit tests (tests/unit, jsdom)
npx vitest run tests/unit/payments.test.ts      # a single file
npx vitest run -t "returns the categories"      # a single test by name
npm run test:e2e                        # Playwright: builds + `next start` on port 3100, desktop + mobile projects
npm run test:integration                # Vitest against the real docker compose services (tests/integration)
npx playwright test tests/e2e/login.spec.ts --project=desktop
```

CI (`.github/workflows/ci.yml`, Node 24) runs lint, `next typegen`, `tsc --noEmit`, `npm test` and `npm run build`. It does not run the e2e or integration tests, which need `docker compose up -d`.

## Architecture

- **Data access**: `src/lib/db.ts` exposes `query()` and `withTransaction()` over one pooled `pg` connection, cached on `globalThis` so hot reloads don't leak connections. Domain modules (`src/lib/users.ts`, `src/lib/categories.ts`, `src/lib/products.ts`) hold the SQL and import `server-only`. Anything that reads the DB during render calls `await connection()` first, so it isn't prerendered at build time. The build runs without a database.
- **Migrations**: plain SQL files in `db/migrations/`, numbered in order. They must stay idempotent (`IF NOT EXISTS`, upsert seeds with `ON CONFLICT`) because the script re-applies all of them every time. There is no migrations tracking table.
- **Products schema** (`004_create_products.sql`): `products` (unique `slug`, `category_id` → `categories`, prices as integer cents with a nullable `compare_at_cents` "was" price that must exceed `price_cents`, so a product is on sale when it's set, `currency`, `stock`, `rating` 0–5, `review_count`, nullable `badge`, `featured`, `specs` as an ordered jsonb array of `{ label, value }`, `created_at`) and `product_images` (`storage_key` in the media bucket, `width`, `height`, `alt`, `position` unique per product, 0 = primary; deleted with their product). Image URLs aren't stored; they're built from the key with `mediaUrl()` on read. A generated `search_text` column (name, brand, both descriptions) has a `pg_trgm` GIN index for `ILIKE` search; category, price, rating, created_at and featured have btree indexes for filtering and sorting.
- **Seeds**: `npm run db:seed` runs `scripts/db-seed.mjs` under `tsx` with the `react-server` export condition, so steps can import app modules from `src/` (TypeScript, `@/` paths, `server-only`) instead of copying them. It runs the steps listed in `db/seed/index.mjs` in order. Each step is a module in `db/seed/` that takes a connected `pg` client, upserts its rows (so re-running is safe) and returns a short summary. The `admin` step upserts `iluu0456@gmail.com` as an `admin` with a bcrypt hash of `SEED_ADMIN_PASSWORD`, resetting the password and role if the account already exists. The `products` step seeds the demo catalogue from `db/seed/products-data.mjs` (10 products per category, made-up brands, Unsplash photo ids). It downloads every photo (cached in the gitignored `.cache/seed-images/`) and stores it with `uploadImage(bytes, "products")` from `src/lib/storage.ts`, before touching the database, so a failed download aborts with the product and URL instead of seeding a product without photos. Then, in one transaction, it upserts products by slug and replaces their image rows. Identical bytes give identical keys, so re-runs don't create new objects.
- **Static vs DB data**: `src/lib/data.ts` holds hardcoded site config, nav links and featured products. Categories come from the DB (`listCategories`); the static `categories` array is used only by the footer.
- **Products**: `src/lib/products.ts` is what pages and the API call. `listProducts({ page, pageSize, q, category, sort, onSale, featured })` returns `{ items, page, pageSize, total, pageCount }`, where items are `ProductSummary` card data (prices, `onSale`, rating, badge, `inStock`, category slug/name, primary `image` or null). Filters combine with AND: every word of `q` (up to five, `%`/`_`/`\` escaped) must appear in `search_text`; an unknown `category` slug matches nothing rather than erroring; `onSale`/`featured` filter only when true. Sorts are `featured` (default: featured, then rating; with a search, name matches rank first), `newest`, `price-asc`, `price-desc` and `rating`, all with a slug tiebreak so pages are stable. A page past the end returns no items with the real `total`. `getProductBySlug(slug)` returns the detail (description, stock, specs, ordered images, up to 4 `related` products from the same category) or null. URL params are parsed with `ProductListQuerySchema` from `src/lib/validation/products.ts` (`page` 1–1000, `pageSize` 1–48 default 12, `q` ≤ 100 chars, slug-shaped `category`, `sort`, boolean `onSale`/`featured`; empty values count as unset; `searchParamsToObject()` converts `URLSearchParams`), which pages can reuse for their `searchParams`. `GET /api/products` returns the list as-is, or 400 `bad_request` with `details.fieldErrors` for invalid params. `GET /api/products/[slug]` returns `{ product }` or 404 `not_found`.
- **Auth**: `src/auth.ts` configures Auth.js with a Credentials provider (bcrypt) and JWT sessions. Login and registration forms post to Server Actions in `src/app/actions/`, which validate with Zod schemas from `src/lib/validation/`. They return a `FormState` (`errors`, `values`, `message`), are used with `useActionState`, and never echo passwords back. `login` calls `signIn` with `redirect: false` and redirects itself, so it can queue a flash toast first. Users have a `role` column (`'user'` or `'admin'`, default `'user'`); registration always creates `user`s and admins come from the seed. `authorize` returns the role, and the `jwt`/`session` callbacks in `src/lib/roles.ts` carry it to `session.user.role` (types augmented in `src/types/next-auth.d.ts`). A role change takes effect at the next sign-in. Pages guard access with `requireUser()` (redirects to `/login`) or `requireAdmin()` (also 404s for non-admins) from `src/lib/auth-guards.ts`.
- **Errors**: `src/lib/errors.ts` defines `AppError` subclasses (status + code), `toErrorBody()` (the only place that decides what reaches the client; unknown errors become a generic 500) and `logError()` (4xx → warn, others → error with stack). Route Handlers must be wrapped in `withErrorHandler` (`src/lib/api/handler.ts`). The wrapper turns thrown errors and ZodErrors into `{ error: { code, message, details? } }`, rethrows Next control-flow errors, and logs status and duration.
- **Media storage**: `src/lib/storage.ts` (server-only) talks to any S3-compatible bucket through `@aws-sdk/client-s3`, configured entirely from `S3_*` env vars. Locally that's S3Mock from `docker compose`; LocalStack isn't used because it now requires an account token. In production the same code points at AWS S3 or Cloudflare R2. `uploadImage(bytes, folder)` accepts JPEG, PNG, WebP or AVIF up to 10 MB, detected from magic bytes. It then normalises the image with `sharp`: it applies the EXIF orientation, shrinks the image to fit 2000 px, re-encodes it as WebP at quality 80, strips all metadata including GPS, and refuses anything over 50 MP. The result is stored under a hash of its bytes (`<folder>/<sha256>.webp`) with `Cache-Control: public, max-age=31536000, immutable`. The function returns the public URL, dimensions, and original and stored sizes. `mediaUrl(key)` builds URLs from `MEDIA_PUBLIC_URL`, which is the CDN in front of the bucket and is also read at build time by `next.config.ts`. Render stored images with `next/image`: optimised variants are cached for 31 days (`minimumCacheTTL`), and `dangerouslyAllowLocalIP` is only on when the media host is localhost. `/api/health` checks the database and the bucket.
- **Logging**: `src/lib/logger.ts` is a dependency-free logger that works on server, edge and browser. Use `logger.child({ scope })`. It redacts sensitive keys (password/token/hash/cookie…), prints pretty output in dev and JSON in prod, and is quiet (`warn`) under tests. `src/proxy.ts` assigns an `x-request-id` that route handlers log. `src/instrumentation.ts` logs unhandled request errors along with their digest.
- **Notifications**: toasts use sonner through the shadcn `Toaster` (`src/components/ui/sonner.tsx`), mounted once in the root layout next to `FlashToaster`. Client code calls `notify` from `src/lib/notify.ts` (`success`/`error`/`warning`/`info`/`show`/`promise`/`dismiss`) and doesn't import `sonner` directly. Server Actions and Route Handlers call `await flash({ type, title, description? })` from `src/lib/flash.ts` (server-only). It stores the notification in a short-lived, non-httpOnly `flash` cookie that survives `redirect()`. `FlashToaster` shows it after the next navigation (or cookie change) and deletes it. Inline form errors stay inline; toasts are for outcomes the user should notice after an action.
- **UI**: `src/components/ui/` contains shadcn-generated primitives. Add new ones with `npx shadcn@latest add <name>` (style `base-nova`, config in `components.json`) rather than writing them by hand. Base UI composes with a `render` prop rather than `asChild`. Page-specific pieces live in `src/components/<area>/`. `next/image` accepts remote images only from the specific Unsplash URL pattern and the `MEDIA_PUBLIC_URL` host, both listed in `next.config.ts`.
- **Icons**: `lucide-react` is the only icon library (`import { ShoppingBag } from "lucide-react"`). Size icons with Tailwind classes (`className="size-4"`), not the `size` prop. Don't add other icon packages.
- **Animations**: Lottie animations load their WASM from `public/lottie/dotlottie-player.wasm`, which must be kept in sync with the installed `@lottiefiles/dotlottie-web`.

## Testing conventions

- Unit tests live in `tests/unit/` and import via the `@/` alias. `tests/unit/setup.tsx` globally mocks the Lottie player (jsdom has no canvas/WASM).
- Modules that import `server-only` require `vi.mock("server-only", () => ({}))`. Mock the domain module (e.g. `@/lib/categories`) rather than the DB, then `await import(...)` the module under test.
- Integration tests live in `tests/integration/` (own config: `vitest.integration.config.mts`, node environment) and call domain modules against the real services instead of mocking them. They clean up what they create and don't depend on seed data (e.g. `products.test.ts` creates its own throwaway category). Domain modules that call `connection()` need `vi.mock("next/server", () => ({ connection: async () => {} }))`, since it throws outside a Next.js request.
- E2E tests run against a production build, not the dev server.

## Development guidelines

### Documentation updates

Docstrings, comments and doc files describe only the current state of the code. When a change makes documentation outdated, rewrite it; don't append the new decision next to the old one.

- No changelog-style traces in docs ("previously X, now Y", "updated because…"). Why *now* differs from *before* belongs in the commit message or PR description.
- Before editing a doc block, read it in full and check the whole block still holds together.
- If a doc you're touching already has stale or conflicting statements, clean them up instead of adding another one on top.

### Test changes

When a test fails, the default is to fix the code, not the test. Never edit expectations, assertions or mocks just to make a test pass.

- Update a test only when the behavior it checks changed on purpose as part of the task.
- If it's unclear whether the code or the test is wrong, stop and ask: explain what the test expects, what the code does and why they disagree.

### Writing tests

Tests exercise behavior, not just "it runs". Before writing assertions, go through the cases that apply: happy path, boundaries (empty, 0, min/max, off-by-one), invalid or missing input, error paths (assert the specific error/status), and state-dependent cases (duplicate, already exists, empty DB). Assert on actual values, shapes and side effects, not truthiness or "didn't throw".
