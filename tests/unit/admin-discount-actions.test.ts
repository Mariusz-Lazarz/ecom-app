import { beforeEach, describe, expect, it, vi } from "vitest"

import { NotFoundError } from "@/lib/errors"

const session = vi.hoisted(() => ({ current: null as null | { user: { id?: string; role: "user" | "admin" } } }))
const discounts = vi.hoisted(() => ({
  createDiscountCode: vi.fn(),
  updateDiscountCode: vi.fn(),
  setDiscountCodeActive: vi.fn(),
  deleteDiscountCode: vi.fn(),
}))
const flash = vi.fn()
const revalidatePath = vi.fn()
const refresh = vi.fn()
const redirect = vi.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` })
})

vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => session.current }))
// The real module (for its error classes) with its database functions mocked.
vi.mock("@/lib/discounts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/discounts")>()),
  ...discounts,
}))
vi.mock("@/lib/flash", () => ({ flash: (...args: unknown[]) => flash(...args) }))
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
  refresh: () => refresh(),
}))
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }))

const { saveDiscountCode, setDiscountCodeActive, deleteDiscountCode } = await import("@/app/actions/admin-discounts")
const { CodeTakenError, CodeInUseError } = await import("@/lib/discounts")

const CODE_ID = "5b0e7c1d-2a3f-4b5c-8d9e-0f1a2b3c4d5e"
const asGuest = () => (session.current = null)
const asUser = () => (session.current = { user: { id: "user-1", role: "user" } })
const asAdmin = () => (session.current = { user: { id: "admin-1", role: "admin" } })

const fields = {
  code: "spring20",
  description: "Spring sale",
  type: "percent",
  value: "20",
  minSubtotal: "30",
  startsOn: "2026-10-01",
  endsOn: "2026-10-31",
  maxRedemptions: "100",
  perUserLimit: "1",
}

function form(values: Record<string, string | undefined>, active = true) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) if (value !== undefined) data.set(key, value)
  if (active) data.set("active", "on")
  return data
}

const parsed = {
  code: "SPRING20",
  description: "Spring sale",
  type: "percent",
  value: 20,
  minSubtotalCents: 3000,
  startsAt: new Date("2026-10-01T00:00:00Z"),
  endsAt: new Date("2026-11-01T00:00:00Z"),
  maxRedemptions: 100,
  perUserLimit: 1,
  active: true,
}

const REDIRECT_TO_LIST = { digest: "NEXT_REDIRECT;replace;/admin/discounts;307;" }
const NO_ACCESS = "You don't have access to this action."

beforeEach(() => {
  asGuest()
  for (const fn of Object.values(discounts)) fn.mockReset()
  flash.mockReset()
  revalidatePath.mockReset()
  refresh.mockReset()
  redirect.mockClear()
})

describe("saveDiscountCode", () => {
  it("sends signed-out callers to the login page, back to the list afterwards", async () => {
    await expect(saveDiscountCode(null, undefined, form(fields))).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/login?callbackUrl=%2Fadmin%2Fdiscounts;307;",
    })
    expect(discounts.createDiscountCode).not.toHaveBeenCalled()
  })

  it("refuses non-admins without touching the database", async () => {
    asUser()
    expect(await saveDiscountCode(null, undefined, form(fields))).toEqual({ message: NO_ACCESS })
    expect(await saveDiscountCode(CODE_ID, undefined, form(fields))).toEqual({ message: NO_ACCESS })
    expect(discounts.createDiscountCode).not.toHaveBeenCalled()
    expect(discounts.updateDiscountCode).not.toHaveBeenCalled()
  })

  it("creates a code from the parsed form, then toasts and goes to the list", async () => {
    asAdmin()
    discounts.createDiscountCode.mockResolvedValue({ id: CODE_ID, code: "SPRING20" })

    await expect(saveDiscountCode(null, undefined, form(fields))).rejects.toMatchObject(REDIRECT_TO_LIST)

    expect(discounts.createDiscountCode).toHaveBeenCalledWith(parsed)
    expect(flash).toHaveBeenCalledWith({ type: "success", title: "Discount code created", description: "SPRING20" })
    expect(revalidatePath).toHaveBeenCalledWith("/admin/discounts")
  })

  it("updates an existing code, reading an unchecked switch as inactive", async () => {
    asAdmin()
    discounts.updateDiscountCode.mockResolvedValue({ id: CODE_ID, code: "SPRING20" })

    await expect(saveDiscountCode(CODE_ID, undefined, form(fields, false))).rejects.toMatchObject(REDIRECT_TO_LIST)

    expect(discounts.updateDiscountCode).toHaveBeenCalledWith(CODE_ID, { ...parsed, active: false })
    expect(flash).toHaveBeenCalledWith({ type: "success", title: "Discount code saved", description: "SPRING20" })
  })

  it("returns field errors and the posted values for invalid input, writing nothing", async () => {
    asAdmin()
    const values = { ...fields, code: "x", value: "150" }

    const state = await saveDiscountCode(null, undefined, form(values))

    expect(state).toEqual({
      errors: { code: ["Use 3–32 letters, digits, dashes or underscores."] },
      values: { ...values, active: true },
      message: "Please check the highlighted fields.",
    })
    expect(discounts.createDiscountCode).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it("reports a value out of range on the value field", async () => {
    asAdmin()
    const state = await saveDiscountCode(null, undefined, form({ ...fields, value: "150" }))
    expect(state?.errors).toEqual({ value: ["Percent off must be a whole number from 1 to 100."] })
  })

  it("puts a taken code on the code field", async () => {
    asAdmin()
    discounts.createDiscountCode.mockRejectedValue(new CodeTakenError())

    const state = await saveDiscountCode(null, undefined, form(fields))

    expect(state).toMatchObject({
      errors: { code: ["Another discount code already uses this code."] },
      message: "Please check the highlighted fields.",
    })
  })

  it("says so when the code was deleted meanwhile, or the id isn't one", async () => {
    asAdmin()
    discounts.updateDiscountCode.mockRejectedValue(new NotFoundError("This discount code no longer exists."))
    expect(await saveDiscountCode(CODE_ID, undefined, form(fields))).toMatchObject({
      message: "This discount code no longer exists.",
    })
    expect(await saveDiscountCode("not-a-uuid", undefined, form(fields))).toEqual({
      message: "This discount code no longer exists.",
    })
    expect(discounts.updateDiscountCode).toHaveBeenCalledTimes(1)
  })

  it("hides unexpected errors behind a generic message", async () => {
    asAdmin()
    discounts.createDiscountCode.mockRejectedValue(new Error("connection reset"))
    expect(await saveDiscountCode(null, undefined, form(fields))).toMatchObject({
      message: "Something went wrong. Please try again.",
    })
  })
})

describe("setDiscountCodeActive", () => {
  it("refuses non-admins", async () => {
    asUser()
    expect(await setDiscountCodeActive(CODE_ID, false)).toEqual({ ok: false, message: NO_ACCESS })
    expect(discounts.setDiscountCodeActive).not.toHaveBeenCalled()
  })

  it("sends signed-out callers to the login page", async () => {
    await expect(setDiscountCodeActive(CODE_ID, false)).rejects.toMatchObject({
      digest: expect.stringContaining("/login"),
    })
  })

  it("toggles the code and re-renders the list", async () => {
    asAdmin()
    discounts.setDiscountCodeActive.mockResolvedValue({ code: "SPRING20", active: false })

    expect(await setDiscountCodeActive(CODE_ID, false)).toEqual({
      ok: true,
      active: false,
      message: "SPRING20 is now inactive.",
    })
    expect(discounts.setDiscountCodeActive).toHaveBeenCalledWith(CODE_ID, false)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("rejects a bad id or a non-boolean without touching the database", async () => {
    asAdmin()
    expect(await setDiscountCodeActive("nope", true)).toEqual({ ok: false, message: "This discount code no longer exists." })
    expect(await setDiscountCodeActive(CODE_ID, "yes" as unknown as boolean)).toMatchObject({ ok: false })
    expect(discounts.setDiscountCodeActive).not.toHaveBeenCalled()
  })

  it("reports a code that is gone", async () => {
    asAdmin()
    discounts.setDiscountCodeActive.mockRejectedValue(new NotFoundError("This discount code no longer exists."))
    expect(await setDiscountCodeActive(CODE_ID, true)).toEqual({ ok: false, message: "This discount code no longer exists." })
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe("deleteDiscountCode", () => {
  it("refuses non-admins", async () => {
    asUser()
    expect(await deleteDiscountCode(CODE_ID)).toEqual({ ok: false, message: NO_ACCESS })
    expect(discounts.deleteDiscountCode).not.toHaveBeenCalled()
  })

  it("deletes an unused code, then toasts and goes to the list", async () => {
    asAdmin()
    discounts.deleteDiscountCode.mockResolvedValue({ code: "SPRING20" })

    await expect(deleteDiscountCode(CODE_ID)).rejects.toMatchObject(REDIRECT_TO_LIST)

    expect(discounts.deleteDiscountCode).toHaveBeenCalledWith(CODE_ID)
    expect(flash).toHaveBeenCalledWith({ type: "success", title: "Discount code deleted", description: "SPRING20" })
  })

  it("says to deactivate a code that has been redeemed", async () => {
    asAdmin()
    discounts.deleteDiscountCode.mockRejectedValue(new CodeInUseError(3))

    expect(await deleteDiscountCode(CODE_ID)).toEqual({
      ok: false,
      message: "This code has been used 3 times, so it can't be deleted. Deactivate it instead.",
    })
    expect(flash).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })
})
