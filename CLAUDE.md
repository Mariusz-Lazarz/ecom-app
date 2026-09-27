# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Northcart: a hobby e-commerce storefront built on Next.js 16 (App Router, React 19), Tailwind v4, shadcn/ui (`base-nova` style, built on `@base-ui/react`, **not** Radix), Auth.js v5 (next-auth beta) and raw `pg` against Postgres. There is no ORM. PRs target the `dev` branch, not `main`.

This Next.js version differs from older ones. For example, middleware is `src/proxy.ts` (exported `proxy` function), and error boundaries receive `retry` rather than `reset`. Check `node_modules/next/dist/docs/` before relying on remembered APIs.

## Commands

```bash
docker compose up -d            # local Postgres 17 (reads .env / defaults ecom:ecom@localhost:5432/ecom)
cp .env.example .env.local      # needs DATABASE_URL and AUTH_SECRET
npm run db:migrate              # applies every db/migrations/*.sql in name order (idempotent)
npm run dev

npm run lint
npx next typegen && npx tsc --noEmit   # typecheck (typegen first, as CI does)
npm test                                # Vitest unit tests (tests/unit, jsdom)
npx vitest run tests/unit/payments.test.ts      # a single file
npx vitest run -t "returns the categories"      # a single test by name
npm run test:e2e                        # Playwright: builds + `next start` on port 3100, desktop + mobile projects
npx playwright test tests/e2e/login.spec.ts --project=desktop
```

CI (`.github/workflows/ci.yml`, Node 24) runs lint, `next typegen`, `tsc --noEmit`, `npm test` and `npm run build`. It does not run the e2e tests.

## Architecture

- **Data access**: `src/lib/db.ts` exposes `query()` and `withTransaction()` over one pooled `pg` connection, cached on `globalThis` so hot reloads don't leak connections. Domain modules (`src/lib/users.ts`, `src/lib/categories.ts`) hold the SQL and import `server-only`. Anything that reads the DB during render calls `await connection()` first, so it isn't prerendered at build time. The build runs without a database.
- **Migrations**: plain SQL files in `db/migrations/`, numbered in order. They must stay idempotent (`IF NOT EXISTS`, upsert seeds with `ON CONFLICT`) because the script re-applies all of them every time. There is no migrations tracking table.
- **Static vs DB data**: `src/lib/data.ts` holds hardcoded site config, nav links and featured products. Categories come from the DB (`listCategories`); the static `categories` array is used only by the footer.
- **Auth**: `src/auth.ts` configures Auth.js with a Credentials provider (bcrypt) and JWT sessions. Login and registration forms post to Server Actions in `src/app/actions/`, which validate with Zod schemas from `src/lib/validation/`. They return a `FormState` (`errors`, `values`, `message`), are used with `useActionState`, and never echo passwords back. `login` has to let Next's redirect error propagate after `signIn` succeeds. Pages guard access with `await auth()` and `redirect()`.
- **Errors**: `src/lib/errors.ts` defines `AppError` subclasses (status + code), `toErrorBody()` (the only place that decides what reaches the client; unknown errors become a generic 500) and `logError()` (4xx → warn, others → error with stack). Route Handlers must be wrapped in `withErrorHandler` (`src/lib/api/handler.ts`). The wrapper turns thrown errors and ZodErrors into `{ error: { code, message, details? } }`, rethrows Next control-flow errors, and logs status and duration.
- **Logging**: `src/lib/logger.ts` is a dependency-free logger that works on server, edge and browser. Use `logger.child({ scope })`. It redacts sensitive keys (password/token/hash/cookie…), prints pretty output in dev and JSON in prod, and is quiet (`warn`) under tests. `src/proxy.ts` assigns an `x-request-id` that route handlers log. `src/instrumentation.ts` logs unhandled request errors along with their digest.
- **UI**: `src/components/ui/` contains shadcn-generated primitives. Base UI composes with a `render` prop rather than `asChild`. Page-specific pieces live in `src/components/<area>/`. Lottie animations load their WASM from `public/lottie/dotlottie-player.wasm`, which must be kept in sync with the installed `@lottiefiles/dotlottie-web`. Remote images are allowed only from the specific Unsplash URL pattern in `next.config.ts`.

## Testing conventions

- Unit tests live in `tests/unit/` and import via the `@/` alias. `tests/unit/setup.tsx` globally mocks the Lottie player (jsdom has no canvas/WASM).
- Modules that import `server-only` require `vi.mock("server-only", () => ({}))`. Mock the domain module (e.g. `@/lib/categories`) rather than the DB, then `await import(...)` the module under test.
- E2E tests run against a production build, not the dev server.
