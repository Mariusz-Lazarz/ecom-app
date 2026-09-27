import "server-only"

import { Pool, type PoolClient, type QueryResultRow } from "pg"

import { logger } from "@/lib/logger"

const log = logger.child({ scope: "db" })
const SLOW_QUERY_MS = 200

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
    log.error("Unexpected Postgres pool error", { err })
  })
  pool.on("connect", () => log.debug("Opened a new connection", { total: pool.totalCount }))

  log.info("Postgres pool created", { max: pool.options.max })

  return pool
}

export function getPool() {
  globalForDb.pgPool ??= createPool()
  return globalForDb.pgPool
}

// Params are never logged: they carry emails and password hashes.
export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) {
  const started = performance.now()
  const sql = text.replace(/\s+/g, " ").trim()
  try {
    const result = await getPool().query<T>(text, params)
    const durationMs = Math.round(performance.now() - started)
    const context = { sql, durationMs, rows: result.rowCount }
    if (durationMs >= SLOW_QUERY_MS) log.warn("Slow query", context)
    else log.debug("Query", context)
    return result
  } catch (err) {
    // Warn only: some failures are expected (e.g. unique violations). Callers log real bugs in full.
    const { code, message } = err as { code?: string; message?: string }
    log.warn("Query failed", { sql, durationMs: Math.round(performance.now() - started), code, message })
    throw err
  }
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
    log.warn("Transaction rolled back", { err })
    throw err
  } finally {
    client.release()
  }
}
