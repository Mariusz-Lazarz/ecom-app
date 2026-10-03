import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const listProducts = vi.fn()
const getProductBySlug = vi.fn()
vi.mock("@/lib/products", () => ({ listProducts, getProductBySlug }))

const { GET: listRoute } = await import("@/app/api/products/route")
const { GET: detailRoute } = await import("@/app/api/products/[slug]/route")

const list = (search = "") => listRoute(new Request(`http://localhost/api/products${search}`), {} as never)
const detail = (slug: string) =>
  detailRoute(new Request(`http://localhost/api/products/${slug}`), { params: Promise.resolve({ slug }) })

const summary = {
  id: "p1",
  slug: "halden-aria",
  name: "Aria",
  brand: "Halden",
  priceCents: 29900,
  compareAtCents: 34900,
  onSale: true,
  category: { slug: "audio", name: "Audio" },
  image: { url: "http://media/products/a.webp", width: 1600, height: 1067, alt: "Aria" },
}
const emptyPage = { items: [], page: 1, pageSize: 12, total: 0, pageCount: 0 }

beforeEach(() => {
  listProducts.mockReset()
  getProductBySlug.mockReset()
  // 4xx responses are logged as warnings; keep the test output clean.
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("GET /api/products", () => {
  it("passes the parsed filters to listProducts and returns its page", async () => {
    const page = { items: [summary], page: 2, pageSize: 24, total: 25, pageCount: 2 }
    listProducts.mockResolvedValue(page)

    const res = await list("?page=2&pageSize=24&q=%20aria%20&category=audio&sort=price-asc&onSale=true&featured=0")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(page)
    expect(listProducts).toHaveBeenCalledExactlyOnceWith({
      page: 2,
      pageSize: 24,
      q: "aria",
      category: "audio",
      sort: "price-asc",
      onSale: true,
      featured: false,
    })
  })

  it("applies the defaults when no query is given and ignores unknown params", async () => {
    listProducts.mockResolvedValue(emptyPage)

    const res = await list("?utm_source=newsletter&q=")

    expect(res.status).toBe(200)
    expect(listProducts).toHaveBeenCalledExactlyOnceWith({ page: 1, pageSize: 12, sort: "featured", q: undefined })
  })

  it("answers an unknown category with an empty page, not an error", async () => {
    listProducts.mockResolvedValue(emptyPage)

    const res = await list("?category=spaceships")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(emptyPage)
    expect(listProducts.mock.calls[0][0]).toMatchObject({ category: "spaceships" })
  })

  it("accepts the page size bounds", async () => {
    listProducts.mockResolvedValue(emptyPage)

    expect((await list("?pageSize=1")).status).toBe(200)
    expect((await list("?pageSize=48")).status).toBe(200)
    expect(listProducts.mock.calls.map(([options]) => options.pageSize)).toEqual([1, 48])
  })

  it("rejects invalid params with a 400 listing every bad field, without querying", async () => {
    const res = await list("?page=0&pageSize=49&sort=cheapest&onSale=maybe&category=Audio%21")

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: "bad_request", message: "Invalid query parameters." })
    expect(Object.keys(body.error.details.fieldErrors).sort()).toEqual(["category", "onSale", "page", "pageSize", "sort"])
    expect(body.error.details.fieldErrors.page).toEqual(["Too small: expected number to be >=1"])
    expect(listProducts).not.toHaveBeenCalled()
  })

  it.each([["?page=abc"], ["?page=1.5"], ["?pageSize=0"], [`?q=${"x".repeat(101)}`]])(
    "rejects %s with a 400",
    async (search) => {
      const res = await list(search)

      expect(res.status).toBe(400)
      expect((await res.json()).error.code).toBe("bad_request")
    },
  )

  it("answers with a generic 500 when the query fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    listProducts.mockRejectedValue(new Error("connection refused"))

    const res = await list()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: { code: "internal_error", message: "Something went wrong. Please try again." },
    })
  })
})

describe("GET /api/products/[slug]", () => {
  it("returns the product for its slug", async () => {
    const product = { ...summary, description: "Long text", specs: [{ label: "Weight", value: "254 g" }], related: [] }
    getProductBySlug.mockResolvedValue(product)

    const res = await detail("halden-aria")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ product })
    expect(getProductBySlug).toHaveBeenCalledExactlyOnceWith("halden-aria")
  })

  it("answers 404 when no product has the slug", async () => {
    getProductBySlug.mockResolvedValue(null)

    const res = await detail("no-such-product")

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Product not found." } })
  })
})
