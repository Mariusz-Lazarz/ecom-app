import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock("@/lib/notify", () => ({ notify }))

const toggleWishlistItem = vi.fn()
vi.mock("@/app/actions/wishlist", () => ({ toggleWishlistItem: (...args: unknown[]) => toggleWishlistItem(...args) }))

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

const { WishlistButton } = await import("@/components/wishlist/wishlist-button")

const PRODUCT_ID = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e"
const props = { productId: PRODUCT_ID, productName: "Aria", saved: false, signedIn: true }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  for (const fn of Object.values(notify)) fn.mockReset()
  toggleWishlistItem.mockReset()
  push.mockReset()
  window.history.replaceState(null, "", "/products?sort=newest")
})

describe("WishlistButton", () => {
  it("is an unpressed 'Save' toggle with an outline heart when not saved", () => {
    render(<WishlistButton {...props} />)

    const button = screen.getByRole("button", { name: "Save Aria to wishlist" })
    expect(button).toHaveAttribute("aria-pressed", "false")
    expect(button.querySelector("svg.lucide-heart")).not.toHaveClass("fill-rose-500")
  })

  it("is a pressed 'Remove' toggle with a filled heart when saved", () => {
    render(<WishlistButton {...props} saved />)

    const button = screen.getByRole("button", { name: "Remove Aria from wishlist" })
    expect(button).toHaveAttribute("aria-pressed", "true")
    expect(button.querySelector("svg.lucide-heart")).toHaveClass("fill-rose-500")
  })

  it("fills at once, keeps the filled state once the server confirms, and toasts", async () => {
    const call = deferred<{ ok: boolean; saved: boolean }>()
    toggleWishlistItem.mockReturnValue(call.promise)
    const user = userEvent.setup()
    const { rerender } = render(<WishlistButton {...props} />)

    await user.click(screen.getByRole("button", { name: "Save Aria to wishlist" }))

    const button = screen.getByRole("button", { name: "Remove Aria from wishlist" })
    expect(button).toHaveAttribute("aria-pressed", "true")
    expect(button).toHaveAttribute("aria-busy", "true")
    expect(toggleWishlistItem).toHaveBeenCalledExactlyOnceWith({ productId: PRODUCT_ID })

    // The action's refresh() re-renders the page with the saved state.
    rerender(<WishlistButton {...props} saved />)
    call.resolve({ ok: true, saved: true })

    await waitFor(() => expect(notify.success).toHaveBeenCalledWith("Saved to your wishlist", { description: "Aria" }))
    expect(screen.getByRole("button", { name: "Remove Aria from wishlist" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Remove Aria from wishlist" })).not.toHaveAttribute("aria-busy")
  })

  it("rolls back and shows the action's message when saving fails", async () => {
    const call = deferred<{ ok: boolean; message: string }>()
    toggleWishlistItem.mockReturnValue(call.promise)
    const user = userEvent.setup()
    render(<WishlistButton {...props} />)

    await user.click(screen.getByRole("button", { name: "Save Aria to wishlist" }))
    expect(screen.getByRole("button", { name: "Remove Aria from wishlist" })).toHaveAttribute("aria-pressed", "true")

    call.resolve({ ok: false, message: "This product no longer exists." })

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save Aria to wishlist" })).toHaveAttribute("aria-pressed", "false"),
    )
    expect(notify.error).toHaveBeenCalledExactlyOnceWith("Couldn't save this item", {
      description: "This product no longer exists.",
    })
    expect(notify.success).not.toHaveBeenCalled()
  })

  it("rolls back an unsave with a generic message when the action throws", async () => {
    toggleWishlistItem.mockRejectedValue(new Error("network down"))
    const user = userEvent.setup()
    render(<WishlistButton {...props} saved />)

    await user.click(screen.getByRole("button", { name: "Remove Aria from wishlist" }))

    await waitFor(() => expect(notify.error).toHaveBeenCalledOnce())
    expect(notify.error).toHaveBeenCalledWith("Couldn't remove this item", {
      description: "Something went wrong. Please try again.",
    })
    expect(screen.getByRole("button", { name: "Remove Aria from wishlist" })).toHaveAttribute("aria-pressed", "true")
  })

  it("sends a guest to /login with a way back to this page, without calling the action", async () => {
    const user = userEvent.setup()
    render(<WishlistButton {...props} signedIn={false} />)

    await user.click(screen.getByRole("button", { name: "Save Aria to wishlist" }))

    expect(toggleWishlistItem).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledExactlyOnceWith(`/login?callbackUrl=${encodeURIComponent("/products?sort=newest")}`)
    expect(notify.info).toHaveBeenCalledWith("Sign in to save items", { description: "Aria" })
    expect(screen.getByRole("button", { name: "Save Aria to wishlist" })).toHaveAttribute("aria-pressed", "false")
  })

  it("sends the visitor to /login when the session ran out meanwhile", async () => {
    toggleWishlistItem.mockResolvedValue({ ok: false, signedOut: true, message: "Sign in to save items." })
    const user = userEvent.setup()
    render(<WishlistButton {...props} />)

    await user.click(screen.getByRole("button", { name: "Save Aria to wishlist" }))

    await waitFor(() => expect(push).toHaveBeenCalledOnce())
    expect(push).toHaveBeenCalledWith(`/login?callbackUrl=${encodeURIComponent("/products?sort=newest")}`)
    expect(notify.error).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save Aria to wishlist" })).toHaveAttribute("aria-pressed", "false"),
    )
  })
})
