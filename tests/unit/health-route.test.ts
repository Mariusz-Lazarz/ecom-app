import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const query = vi.fn()
vi.mock("@/lib/db", () => ({ query: (...args: unknown[]) => query(...args) }))

const checkStorage = vi.fn()
vi.mock("@/lib/storage", () => ({ checkStorage: () => checkStorage() }))

const { GET } = await import("@/app/api/health/route")

const call = () => GET(new Request("http://localhost/api/health"), {} as never)

describe("GET /api/health", () => {
  beforeEach(() => {
    query.mockReset()
    checkStorage.mockReset()
  })

  it("reports the database and media storage as up", async () => {
    const now = new Date("2026-09-28T12:00:00Z")
    query.mockResolvedValue({ rows: [{ now }] })
    checkStorage.mockResolvedValue(undefined)

    const res = await call()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "ok", db: "up", storage: "up", time: now.toISOString() })
  })

  it("answers 503 when the database is down", async () => {
    query.mockRejectedValue(new Error("connect ECONNREFUSED"))
    checkStorage.mockResolvedValue(undefined)

    const res = await call()

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({
      error: { code: "service_unavailable", message: "Database is unreachable" },
    })
  })

  it("answers 503 when media storage is down", async () => {
    query.mockResolvedValue({ rows: [{ now: new Date() }] })
    checkStorage.mockRejectedValue(new Error("NoSuchBucket"))

    const res = await call()

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({
      error: { code: "service_unavailable", message: "Media storage is unreachable" },
    })
  })
})
