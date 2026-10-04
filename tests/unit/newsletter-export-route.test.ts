import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: "user" | "admin" } } }))
const listSubscribedForExport = vi.hoisted(() => vi.fn())
vi.mock("@/auth", () => ({ auth: async () => session.current }))
vi.mock("@/lib/newsletter", () => ({ listSubscribedForExport }))

const { GET } = await import("@/app/api/admin/newsletter/export/route")

const call = () => GET(new Request("http://localhost/api/admin/newsletter/export"), {} as never)

beforeEach(() => {
  session.current = null
  listSubscribedForExport.mockReset().mockResolvedValue([])
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("GET /api/admin/newsletter/export", () => {
  it("answers 401 to signed-out visitors without reading subscribers", async () => {
    const res = await call()

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: { code: "unauthorized", message: "Authentication required" } })
    expect(listSubscribedForExport).not.toHaveBeenCalled()
  })

  it("answers 404 to customers, like the admin pages", async () => {
    session.current = { user: { id: "u1", role: "user" } }

    const res = await call()

    expect(res.status).toBe(404)
    expect(listSubscribedForExport).not.toHaveBeenCalled()
  })

  it("gives admins a CSV attachment of the subscribed addresses", async () => {
    session.current = { user: { id: "a1", role: "admin" } }
    listSubscribedForExport.mockResolvedValue([
      { email: "ada@example.com", source: "home", updatedAt: new Date("2026-10-01T10:00:00Z") },
      { email: "=evil@example.com", source: "register", updatedAt: new Date("2026-10-02T11:30:00Z") },
    ])

    const res = await call()

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8")
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="newsletter-subscribers-\d{4}-\d{2}-\d{2}\.csv"$/)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.text()).toBe(
      "email,source,subscribed_at\r\n" +
        "ada@example.com,home,2026-10-01T10:00:00.000Z\r\n" +
        "'=evil@example.com,register,2026-10-02T11:30:00.000Z\r\n",
    )
  })

  it("exports just the header when nobody is subscribed", async () => {
    session.current = { user: { id: "a1", role: "admin" } }

    expect(await (await call()).text()).toBe("email,source,subscribed_at\r\n")
  })

  it("answers a generic 500 when the database fails", async () => {
    session.current = { user: { id: "a1", role: "admin" } }
    listSubscribedForExport.mockRejectedValue(new Error("db down"))

    const res = await call()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: { code: "internal_error", message: "Something went wrong. Please try again." } })
  })
})
