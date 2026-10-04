import { beforeEach, describe, expect, it, vi } from "vitest"

import type { OrderExportOptions, OrderExportRow } from "@/lib/orders"

vi.mock("server-only", () => ({}))

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: "user" | "admin" } } }))
const listOrdersForExport = vi.hoisted(() => vi.fn<(options: OrderExportOptions) => Promise<OrderExportRow[]>>())
vi.mock("@/auth", () => ({ auth: async () => session.current }))
vi.mock("@/lib/orders", () => ({ listOrdersForExport }))

const { GET } = await import("@/app/api/admin/orders/export/route")

const call = (search = "") => GET(new Request(`http://localhost/api/admin/orders/export${search}`), {} as never)
const asAdmin = () => (session.current = { user: { id: "a1", role: "admin" } })

const HEADER =
  "number,date,customer_name,customer_email,status,items,subtotal,discount_code,discount,shipping,total,currency\r\n"

const row = (overrides: Partial<OrderExportRow> = {}): OrderExportRow => ({
  number: "NC-10001",
  createdAt: new Date("2026-10-01T10:00:00Z"),
  customerName: "Ada Lovelace",
  customerEmail: "ada@example.com",
  status: "delivered",
  itemCount: 3,
  subtotalCents: 12000,
  discountCode: null,
  discountCents: 0,
  shippingCents: 599,
  totalCents: 12599,
  currency: "USD",
  ...overrides,
})

beforeEach(() => {
  session.current = null
  listOrdersForExport.mockReset().mockResolvedValue([])
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("GET /api/admin/orders/export", () => {
  it("answers 401 to signed-out visitors without reading orders", async () => {
    const res = await call()

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: { code: "unauthorized", message: "Authentication required" } })
    expect(listOrdersForExport).not.toHaveBeenCalled()
  })

  it("answers 404 to customers, like the admin pages", async () => {
    session.current = { user: { id: "u1", role: "user" } }

    const res = await call("?status=pending")

    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe("not_found")
    expect(listOrdersForExport).not.toHaveBeenCalled()
  })

  it("gives admins a CSV attachment with one row per order, amounts in dollars", async () => {
    asAdmin()
    listOrdersForExport.mockResolvedValue([
      row(),
      row({
        number: "NC-10002",
        createdAt: new Date("2026-10-02T23:59:59.500Z"),
        customerName: "Grace, \"Amazing\" Hopper",
        customerEmail: "=cmd@example.com",
        status: "cancelled",
        itemCount: 1,
        subtotalCents: 5000,
        discountCode: "SAVE15",
        discountCents: 1500,
        shippingCents: 0,
        totalCents: 3500,
      }),
    ])

    const res = await call()

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8")
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="orders-\d{4}-\d{2}-\d{2}\.csv"$/)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.text()).toBe(
      HEADER +
        "NC-10001,2026-10-01T10:00:00.000Z,Ada Lovelace,ada@example.com,delivered,3,120.00,,0.00,5.99,125.99,USD\r\n" +
        'NC-10002,2026-10-02T23:59:59.500Z,"Grace, ""Amazing"" Hopper",\'=cmd@example.com,cancelled,1,50.00,SAVE15,15.00,0.00,35.00,USD\r\n',
    )
  })

  it("passes the filters through, trimmed, with empty ones left out", async () => {
    asAdmin()

    await call("?status=shipped&q=%20ada%20&from=2026-09-01&to=2026-09-30")
    await call("?status=&q=&from=&to=")

    expect(listOrdersForExport.mock.calls).toEqual([
      [{ status: "shipped", q: "ada", from: "2026-09-01", to: "2026-09-30" }],
      [{ status: undefined, q: undefined, from: undefined, to: undefined }],
    ])
  })

  it("allows a single day (from = to)", async () => {
    asAdmin()

    expect((await call("?from=2026-09-01&to=2026-09-01")).status).toBe(200)
  })

  it("exports just the header when nothing matches", async () => {
    asAdmin()

    expect(await (await call("?status=rejected")).text()).toBe(HEADER)
  })

  it.each([
    ["?status=lost", "status"],
    ["?from=2026-9-1", "from"],
    ["?to=2026-02-30", "to"],
    ["?from=2026-10-02&to=2026-10-01", "to"],
    [`?q=${"x".repeat(101)}`, "q"],
  ])("answers 400 for %s", async (search, field) => {
    asAdmin()

    const res = await call(search)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe("bad_request")
    expect(Object.keys(body.error.details.fieldErrors)).toEqual([field])
    expect(listOrdersForExport).not.toHaveBeenCalled()
  })

  it("answers a generic 500 when the database fails", async () => {
    asAdmin()
    listOrdersForExport.mockRejectedValue(new Error("db down"))

    const res = await call()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: { code: "internal_error", message: "Something went wrong. Please try again." } })
  })
})
