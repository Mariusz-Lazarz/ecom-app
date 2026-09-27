import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const listCategories = vi.fn()
vi.mock("@/lib/categories", () => ({ listCategories }))

const { GET } = await import("@/app/api/categories/route")

const call = () => GET(new Request("http://localhost/api/categories"), {} as never)

describe("GET /api/categories", () => {
  beforeEach(() => {
    listCategories.mockReset()
  })

  it("returns the categories from the database", async () => {
    const categories = [{ id: "1", slug: "audio", name: "Audio", icon: "headphones" }]
    listCategories.mockResolvedValue(categories)

    const res = await call()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ categories })
  })

  it("answers with a generic 500 when the query fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    listCategories.mockRejectedValue(new Error("connection refused"))

    const res = await call()

    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe("internal_error")
    spy.mockRestore()
  })
})
