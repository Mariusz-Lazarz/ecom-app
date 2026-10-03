import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { DiscountCode } from "@/lib/discounts"
import type { DiscountFormState } from "@/lib/validation/discounts"

import { makeCart, makeCartItem } from "./fixtures/cart"
import { makeOrderDetail, makeOrderSummary } from "./fixtures/orders"

const requireAdmin = vi.fn()
const listDiscountCodes = vi.fn<() => Promise<DiscountCode[]>>()
const getDiscountCode = vi.fn<(id: string) => Promise<DiscountCode | null>>()
const saveDiscountCode = vi.fn<(id: string | null, state: DiscountFormState, formData: FormData) => Promise<DiscountFormState>>()
const setDiscountCodeActive = vi.fn()
const deleteDiscountCode = vi.fn()
const notFound = vi.fn(() => {
  throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" })
})

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth-guards", () => ({ requireAdmin: (path: string) => requireAdmin(path) }))
vi.mock("@/lib/discounts", () => ({
  listDiscountCodes: () => listDiscountCodes(),
  getDiscountCode: (id: string) => getDiscountCode(id),
}))
vi.mock("@/app/actions/admin-discounts", () => ({
  saveDiscountCode: (id: string | null, state: DiscountFormState, formData: FormData) => saveDiscountCode(id, state, formData),
  setDiscountCodeActive: (id: string, active: boolean) => setDiscountCodeActive(id, active),
  deleteDiscountCode: (id: string) => deleteDiscountCode(id),
}))
vi.mock("next/navigation", () => ({ notFound: () => notFound() }))
const notify = { success: vi.fn(), error: vi.fn() }
vi.mock("@/lib/notify", () => ({ notify }))

const { CartTotals } = await import("@/components/cart/cart-summary")
const { OrderTotals } = await import("@/components/orders/order-totals")
const { AdminOrderTable } = await import("@/components/admin/admin-order-table")
const { DiscountCodeTable, discountCodeStatus, formatValidity } = await import("@/components/admin/discount-code-table")
const { DiscountCodeForm } = await import("@/components/admin/discount-code-form")
const { DeleteDiscountButton } = await import("@/components/admin/delete-discount-button")
const { default: DiscountsPage } = await import("@/app/admin/discounts/page")
const { default: NewDiscountPage } = await import("@/app/admin/discounts/new/page")
const { default: EditDiscountPage } = await import("@/app/admin/discounts/[id]/page")

const CODE_ID = "5b0e7c1d-2a3f-4b5c-8d9e-0f1a2b3c4d5e"
const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }

const discountCode = (overrides: Partial<DiscountCode> = {}): DiscountCode => ({
  id: CODE_ID,
  code: "WELCOME10",
  description: "10% off a first order over $30",
  type: "percent",
  value: 10,
  minSubtotalCents: 3000,
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
  perUserLimit: 1,
  active: true,
  createdAt: new Date("2026-09-01T00:00:00Z"),
  redemptionCount: 0,
  ...overrides,
})

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { id: "admin-1", role: "admin" } })
  listDiscountCodes.mockReset().mockResolvedValue([])
  getDiscountCode.mockReset().mockResolvedValue(null)
  saveDiscountCode.mockReset()
  setDiscountCodeActive.mockReset()
  deleteDiscountCode.mockReset()
  notify.success.mockReset()
  notify.error.mockReset()
  notFound.mockClear()
})

describe("CartTotals with a discount code", () => {
  const summary = () => document.querySelector<HTMLElement>('dl[aria-label="Order summary"]')!
  const row = (label: string) => within(summary()).getByText(label).nextElementSibling!
  const welcome = { code: "WELCOME10", type: "percent", value: 10, minSubtotalCents: 3000 } as const

  it("shows what the applied code takes off", () => {
    render(<CartTotals cart={{ ...makeCart([makeCartItem({ priceCents: 4550 })]), discount: welcome }} />)

    expect(row("Discount (WELCOME10)")).toHaveTextContent("−$4.55")
    expect(row("Shipping")).toHaveTextContent("Calculated at checkout")
    expect(screen.queryByText("Have a discount code? Add it at checkout.")).not.toBeInTheDocument()
  })

  it("leaves the code's line out while the subtotal is below its minimum", () => {
    render(<CartTotals cart={{ ...makeCart([makeCartItem({ priceCents: 2999 })]), discount: welcome }} />)
    expect(within(summary()).queryByText(/^Discount/)).not.toBeInTheDocument()
  })

  it("makes shipping free with a free-shipping code and drops the threshold progress", () => {
    const freeShip = { code: "FREESHIP", type: "free_shipping", value: 0, minSubtotalCents: 0 } as const
    render(<CartTotals cart={{ ...makeCart([makeCartItem({ priceCents: 1000 })]), discount: freeShip }} />)

    expect(row("Discount (FREESHIP)")).toHaveTextContent("Free shipping")
    expect(row("Shipping")).toHaveTextContent("Free")
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })

  it("points to checkout without a code, and explains a code that was just removed", () => {
    const { unmount } = render(<CartTotals cart={makeCart([makeCartItem()])} />)
    expect(screen.getByText("Have a discount code? Add it at checkout.")).toBeInTheDocument()
    unmount()

    render(
      <CartTotals cart={{ ...makeCart([makeCartItem()]), discountNotice: "EXPIRED5 has expired. We've removed it from your cart." }} />,
    )
    expect(screen.getByRole("status")).toHaveTextContent("EXPIRED5 has expired. We've removed it from your cart.")
    expect(screen.queryByText("Have a discount code? Add it at checkout.")).not.toBeInTheDocument()
  })
})

describe("OrderTotals with a discount code", () => {
  it("shows the code and amount between savings and shipping", () => {
    render(
      <OrderTotals
        {...makeOrderDetail({ subtotalCents: 4000, discountCode: "WELCOME10", discountCents: 400, shippingCents: 599, totalCents: 4199 })}
      />,
    )
    const totals = document.querySelector<HTMLElement>('dl[aria-label="Order totals"]')!
    expect([...totals.querySelectorAll("dt")].map((dt) => dt.textContent)).toEqual([
      "Subtotal",
      "You saved",
      "Discount (WELCOME10)",
      "Shipping (Standard)",
      "Total",
    ])
    expect(within(totals).getByText("Discount (WELCOME10)").nextElementSibling).toHaveTextContent("−$4.00")
    expect(within(totals).getByText("Total").nextElementSibling).toHaveTextContent("$41.99")
  })

  it("shows a free-shipping code as such, and nothing without a code", () => {
    const { unmount } = render(
      <OrderTotals {...makeOrderDetail({ discountCode: "FREESHIP", discountCents: 0, shippingCents: 0 })} />,
    )
    expect(screen.getByText("Discount (FREESHIP)").nextElementSibling).toHaveTextContent("Free shipping")
    unmount()

    render(<OrderTotals {...makeOrderDetail()} />)
    expect(screen.queryByText(/^Discount/)).not.toBeInTheDocument()
  })
})

describe("AdminOrderTable", () => {
  it("shows a used code under the order's total", () => {
    const customer = { id: "u1", name: "Ada Lovelace", email: "ada@example.com" }
    render(
      <AdminOrderTable
        orders={[
          { ...makeOrderSummary({ number: "NC-10001", totalCents: 4199, discountCode: "WELCOME10", discountCents: 400 }), customer },
          { ...makeOrderSummary({ number: "NC-10002", discountCode: "FREESHIP", discountCents: 0 }), customer },
          { ...makeOrderSummary({ number: "NC-10003" }), customer },
        ]}
      />,
    )
    const rows = screen.getAllByRole("row").slice(1)
    expect(rows[0]).toHaveTextContent("$41.99WELCOME10 −$4.00")
    expect(rows[1]).toHaveTextContent("FREESHIP")
    expect(rows[1]).not.toHaveTextContent("FREESHIP −")
    expect(rows[2]).not.toHaveTextContent(/WELCOME10|FREESHIP/)
  })
})

describe("discountCodeStatus and formatValidity", () => {
  const now = new Date("2026-06-15T12:00:00Z")

  it("names where a code stands", () => {
    expect(discountCodeStatus(discountCode(), now)).toBe("active")
    expect(discountCodeStatus(discountCode({ active: false, endsAt: now }), now)).toBe("inactive")
    expect(discountCodeStatus(discountCode({ endsAt: now }), now)).toBe("expired")
    expect(discountCodeStatus(discountCode({ startsAt: new Date("2026-07-01T00:00:00Z") }), now)).toBe("scheduled")
    expect(discountCodeStatus(discountCode({ maxRedemptions: 1, redemptionCount: 1 }), now)).toBe("used-up")
    expect(discountCodeStatus(discountCode({ maxRedemptions: 2, redemptionCount: 1 }), now)).toBe("active")
  })

  it("shows the days as entered, the end date inclusive", () => {
    const startsAt = new Date("2026-10-01T00:00:00Z")
    const endsAt = new Date("2026-11-01T00:00:00Z")
    expect(formatValidity({ startsAt, endsAt })).toBe("Oct 1, 2026 – Oct 31, 2026")
    expect(formatValidity({ startsAt, endsAt: null })).toBe("From Oct 1, 2026")
    expect(formatValidity({ startsAt: null, endsAt })).toBe("Until Oct 31, 2026")
    expect(formatValidity({ startsAt: null, endsAt: null })).toBe("No end date")
  })
})

describe("DiscountCodeTable", () => {
  const now = new Date("2026-06-15T12:00:00Z")

  it("lists each code with its discount, usage, dates, status and switch", () => {
    render(
      <DiscountCodeTable
        now={now}
        codes={[
          discountCode(),
          discountCode({
            id: "c2",
            code: "ONCE20",
            description: "",
            value: 20,
            minSubtotalCents: 0,
            maxRedemptions: 1,
            redemptionCount: 1,
            perUserLimit: null,
          }),
          discountCode({ id: "c3", code: "SAVE15", type: "fixed", value: 1500, active: false }),
          discountCode({ id: "c4", code: "EXPIRED5", endsAt: new Date("2026-01-01T00:00:00Z") }),
        ]}
      />,
    )
    const rows = screen.getAllByRole("row").slice(1)

    expect(within(rows[0]).getByRole("link", { name: "WELCOME10" })).toHaveAttribute("href", `/admin/discounts/${CODE_ID}`)
    expect(rows[0]).toHaveTextContent("10% offOrders over $30.00")
    expect(rows[0]).toHaveTextContent("0 / ∞1 per customer")
    expect(rows[0]).toHaveTextContent("No end date")
    expect(rows[0]).toHaveTextContent("Active")
    expect(within(rows[0]).getByRole("switch", { name: "WELCOME10 active" })).toBeChecked()

    expect(rows[1]).toHaveTextContent("20% offAny order")
    expect(rows[1]).toHaveTextContent("1 / 1No limit per customer")
    expect(rows[1]).toHaveTextContent("Used up")

    expect(rows[2]).toHaveTextContent("$15.00 off")
    expect(rows[2]).toHaveTextContent("Inactive")
    expect(within(rows[2]).getByRole("switch", { name: "SAVE15 active" })).not.toBeChecked()

    expect(rows[3]).toHaveTextContent("Until Dec 31, 2025")
    expect(rows[3]).toHaveTextContent("Expired")
  })

  it("toggles a code through the action and confirms it", async () => {
    const user = userEvent.setup()
    setDiscountCodeActive.mockResolvedValue({ ok: true, active: false, message: "WELCOME10 is now inactive." })
    render(<DiscountCodeTable codes={[discountCode()]} now={now} />)

    await user.click(screen.getByRole("switch", { name: "WELCOME10 active" }))

    expect(setDiscountCodeActive).toHaveBeenCalledWith(CODE_ID, false)
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith("WELCOME10 is now inactive."))
  })

  it("flips the switch back and reports a failure", async () => {
    const user = userEvent.setup()
    setDiscountCodeActive.mockResolvedValue({ ok: false, message: "You don't have access to this action." })
    render(<DiscountCodeTable codes={[discountCode()]} now={now} />)

    await user.click(screen.getByRole("switch", { name: "WELCOME10 active" }))

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith("Couldn't update the code", {
        description: "You don't have access to this action.",
      }),
    )
    expect(screen.getByRole("switch", { name: "WELCOME10 active" })).toBeChecked()
  })
})

describe("DiscountCodeForm", () => {
  it("starts a new code as an active percent code, one use per customer", () => {
    render(<DiscountCodeForm discount={null} />)

    expect(screen.getByRole("form", { name: "New discount code" })).toBeInTheDocument()
    expect(screen.getByLabelText("Code")).toHaveValue("")
    expect(screen.getByLabelText("Percent off")).toHaveValue("")
    expect(screen.getByLabelText("Uses per customer")).toHaveValue("1")
    expect(screen.getByLabelText("Total uses")).toHaveValue("")
    expect(screen.getByRole("switch", { name: "Active" })).toBeChecked()
    expect(screen.getByRole("button", { name: "Create code" })).toBeInTheDocument()
  })

  it("fills in an existing code's values", () => {
    render(
      <DiscountCodeForm
        discount={discountCode({
          type: "fixed",
          value: 1500,
          minSubtotalCents: 10000,
          startsAt: new Date("2026-10-01T00:00:00Z"),
          endsAt: new Date("2026-11-01T00:00:00Z"),
          maxRedemptions: 50,
          perUserLimit: null,
          active: false,
        })}
      />,
    )

    expect(screen.getByRole("form", { name: "Edit discount code" })).toBeInTheDocument()
    expect(screen.getByLabelText("Code")).toHaveValue("WELCOME10")
    expect(screen.getByLabelText("Amount off")).toHaveValue("15.00")
    expect(screen.getByLabelText("Minimum subtotal")).toHaveValue("100.00")
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-10-01")
    expect(screen.getByLabelText("End date")).toHaveValue("2026-10-31")
    expect(screen.getByLabelText("Total uses")).toHaveValue("50")
    expect(screen.getByLabelText("Uses per customer")).toHaveValue("")
    expect(screen.getByRole("switch", { name: "Active" })).not.toBeChecked()
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument()
  })

  it("has no value field for a free-shipping code", () => {
    render(<DiscountCodeForm discount={discountCode({ type: "free_shipping", value: 0 })} />)
    expect(screen.queryByLabelText("Percent off")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Amount off")).not.toBeInTheDocument()
    expect(screen.getByText("Shipping is free with any method while the code applies.")).toBeInTheDocument()
  })

  it("posts the fields to the action for this code and shows its errors inline, keeping what was typed", async () => {
    const user = userEvent.setup()
    saveDiscountCode.mockResolvedValue({
      message: "Please check the highlighted fields.",
      errors: { code: ["Another discount code already uses this code."] },
    })
    render(<DiscountCodeForm discount={discountCode()} />)

    await user.clear(screen.getByLabelText("Percent off"))
    await user.type(screen.getByLabelText("Percent off"), "25")
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => expect(saveDiscountCode).toHaveBeenCalledOnce())
    const [id, , formData] = saveDiscountCode.mock.calls[0]
    expect(id).toBe(CODE_ID)
    expect(Object.fromEntries(formData.entries())).toMatchObject({
      code: "WELCOME10",
      type: "percent",
      value: "25",
      minSubtotal: "30.00",
      perUserLimit: "1",
      active: "on",
    })

    expect(await screen.findByText("Another discount code already uses this code.")).toBeInTheDocument()
    expect(screen.getByLabelText("Code")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByText("Please check the highlighted fields.")).toBeInTheDocument()
    expect(screen.getByLabelText("Percent off")).toHaveValue("25")
  })
})

describe("DeleteDiscountButton", () => {
  it("can't delete a redeemed code and says to deactivate it", () => {
    render(<DeleteDiscountButton id={CODE_ID} code="WELCOME10" redemptionCount={2} />)
    const button = screen.getByRole("button", { name: "Delete" })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription("Used 2 times: deactivate it instead.")
  })

  it("deletes an unused code after confirming", async () => {
    const user = userEvent.setup()
    deleteDiscountCode.mockResolvedValue({ ok: false, message: "This discount code no longer exists." })
    render(<DeleteDiscountButton id={CODE_ID} code="SPRING20" redemptionCount={0} />)

    await user.click(screen.getByRole("button", { name: "Delete" }))
    const dialog = await screen.findByRole("alertdialog", { name: "Delete SPRING20?" })
    await user.click(within(dialog).getByRole("button", { name: "Delete code" }))

    expect(deleteDiscountCode).toHaveBeenCalledWith(CODE_ID)
    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith("Couldn't delete the code", {
        description: "This discount code no longer exists.",
      }),
    )
  })
})

describe("admin discount pages", () => {
  const forbid = () => requireAdmin.mockImplementation(async () => notFound())

  it("404 for non-admins before reading anything", async () => {
    forbid()
    await expect(DiscountsPage()).rejects.toMatchObject(NOT_FOUND)
    expect(requireAdmin).toHaveBeenLastCalledWith("/admin/discounts")
    await expect(NewDiscountPage()).rejects.toMatchObject(NOT_FOUND)
    expect(requireAdmin).toHaveBeenLastCalledWith("/admin/discounts/new")
    await expect(
      EditDiscountPage({ params: Promise.resolve({ id: CODE_ID }), searchParams: Promise.resolve({}) }),
    ).rejects.toMatchObject(NOT_FOUND)
    expect(requireAdmin).toHaveBeenLastCalledWith(`/admin/discounts/${CODE_ID}`)
    expect(listDiscountCodes).not.toHaveBeenCalled()
    expect(getDiscountCode).not.toHaveBeenCalled()
  })

  it("lists the codes, or says there are none", async () => {
    render(await DiscountsPage())
    expect(screen.getByText("No discount codes yet")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "New code" })).toHaveAttribute("href", "/admin/discounts/new")
  })

  it("shows the table when there are codes", async () => {
    listDiscountCodes.mockResolvedValue([discountCode()])
    render(await DiscountsPage())
    expect(screen.getByRole("table", { name: "Discount codes" })).toHaveTextContent("WELCOME10")
  })

  it("edits a code with its usage, and 404s for an unknown or malformed id", async () => {
    getDiscountCode.mockResolvedValue(discountCode({ redemptionCount: 3, maxRedemptions: 10 }))
    render(await EditDiscountPage({ params: Promise.resolve({ id: CODE_ID }), searchParams: Promise.resolve({}) }))
    expect(screen.getByRole("heading", { level: 1, name: "WELCOME10" })).toBeInTheDocument()
    expect(screen.getByText("Used 3 times of 10")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled()

    getDiscountCode.mockResolvedValue(null)
    await expect(
      EditDiscountPage({ params: Promise.resolve({ id: CODE_ID }), searchParams: Promise.resolve({}) }),
    ).rejects.toMatchObject(NOT_FOUND)
    getDiscountCode.mockClear()
    await expect(
      EditDiscountPage({ params: Promise.resolve({ id: "nope" }), searchParams: Promise.resolve({}) }),
    ).rejects.toMatchObject(NOT_FOUND)
    expect(getDiscountCode).not.toHaveBeenCalled()
  })
})
