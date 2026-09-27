// Applies every db/migrations/*.sql file in name order. Migrations are written to be
// idempotent (IF NOT EXISTS), so re-running this is safe.
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import pg from "pg"

const dir = path.join(import.meta.dirname, "..", "db", "migrations")
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
try {
  for (const file of files) {
    await client.query(await readFile(path.join(dir, file), "utf8"))
    console.log(`applied ${file}`)
  }
} finally {
  await client.end()
}
