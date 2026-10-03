// Runs every seed step from db/seed/index.mjs in order. Steps are idempotent (upserts),
// so re-running this is safe. Run `npm run db:migrate` first.
//
// `npm run db:seed` runs this under tsx with the react-server export condition, so steps can import
// app modules from src/ (TypeScript, `@/` paths, `server-only`) instead of duplicating them.
import pg from "pg"

import { steps } from "../db/seed/index.mjs"

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
try {
  for (const step of steps) {
    console.log(`seeded ${step.name}: ${await step.run(client)}`)
  }
} catch (err) {
  console.error(`seed failed: ${err.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
