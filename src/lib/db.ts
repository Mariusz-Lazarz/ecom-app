import "server-only"

import { Pool, type PoolClient, type QueryResultRow } from "pg"

// Reuse one pool across hot reloads in dev, otherwise every edit leaks connections.
const globalForDb = globalThis as unknown as { pgPool?: Pool }

function createPool() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and run `docker compose up -d`.")
  }

  const pool = new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })

  // An idle client erroring (e.g. the DB restarted) must not crash the server.
  pool.on("error", (err) => {
    console.error("Unexpected Postgres pool error", err)
  })

  return pool
}

export function getPool() {
  globalForDb.pgPool ??= createPool()
  return globalForDb.pgPool
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) {
  return getPool().query<T>(text, params)
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect()
  try {
    await client.query("BEGIN")
    const result = await fn(client)
    await client.query("COMMIT")
    return result
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
  }
}
