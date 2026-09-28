import { render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const show = vi.fn()
let pathname = "/"

vi.mock("@/lib/notify", () => ({ notify: { show: (...args: unknown[]) => show(...args) } }))
vi.mock("next/navigation", () => ({ usePathname: () => pathname }))

const { FlashToaster, consumeFlash } = await import("@/components/notifications/flash-toaster")

function setFlash(value: unknown) {
  const raw = typeof value === "string" ? value : JSON.stringify(value)
  document.cookie = `flash=${encodeURIComponent(raw)}; path=/`
}

function clearCookies() {
  for (const c of document.cookie.split("; ").filter(Boolean)) {
    document.cookie = `${c.split("=")[0]}=; Max-Age=0; path=/`
  }
}

describe("consumeFlash", () => {
  beforeEach(() => {
    show.mockReset()
    clearCookies()
  })

  it("shows the queued notification and deletes the cookie", () => {
    setFlash({ type: "success", title: "Welcome back!", description: "You're signed in." })

    consumeFlash()

    expect(show).toHaveBeenCalledExactlyOnceWith({
      type: "success",
      title: "Welcome back!",
      description: "You're signed in.",
    })
    expect(document.cookie).not.toContain("flash=")
  })

  it("shows the notification only once when called twice", () => {
    setFlash({ type: "info", title: "Once" })

    consumeFlash()
    consumeFlash()

    expect(show).toHaveBeenCalledTimes(1)
  })

  it("does nothing without a flash cookie and leaves other cookies alone", () => {
    document.cookie = "theme=dark; path=/"
    document.cookie = "notflash=x; path=/"

    consumeFlash()

    expect(show).not.toHaveBeenCalled()
    expect(document.cookie).toContain("theme=dark")
    expect(document.cookie).toContain("notflash=x")
  })

  it.each([
    ["malformed JSON", encodeURIComponent("{oops")],
    ["an unknown type", encodeURIComponent(JSON.stringify({ type: "danger", title: "x" }))],
    ["badly encoded text", "%E0%A4%A"],
  ])("deletes but does not show %s", (_label, cookieValue) => {
    document.cookie = `flash=${cookieValue}; path=/`

    consumeFlash()

    expect(show).not.toHaveBeenCalled()
    expect(document.cookie).not.toContain("flash=")
  })
})

describe("FlashToaster", () => {
  beforeEach(() => {
    show.mockReset()
    clearCookies()
    pathname = "/"
  })

  afterEach(() => {
    delete (globalThis as { cookieStore?: unknown }).cookieStore
  })

  it("renders nothing and shows a notification queued before the first load", () => {
    setFlash({ type: "success", title: "Signed out" })

    const { container } = render(<FlashToaster />)

    expect(container).toBeEmptyDOMElement()
    expect(show).toHaveBeenCalledExactlyOnceWith({ type: "success", title: "Signed out" })
  })

  it("checks again after navigating to another page", () => {
    const { rerender } = render(<FlashToaster />)
    expect(show).not.toHaveBeenCalled()

    setFlash({ type: "success", title: "Welcome back!" })
    pathname = "/account"
    rerender(<FlashToaster />)

    expect(show).toHaveBeenCalledExactlyOnceWith({ type: "success", title: "Welcome back!" })
  })

  it("does not check again when re-rendered on the same page", () => {
    const { rerender } = render(<FlashToaster />)
    setFlash({ type: "info", title: "Later" })

    rerender(<FlashToaster />)

    expect(show).not.toHaveBeenCalled()
  })

  it("picks up a flash set while staying on the page through cookie change events", () => {
    const store = new EventTarget()
    ;(globalThis as { cookieStore?: EventTarget }).cookieStore = store
    const { unmount } = render(<FlashToaster />)

    setFlash({ type: "warning", title: "Heads up" })
    store.dispatchEvent(new Event("change"))
    expect(show).toHaveBeenCalledExactlyOnceWith({ type: "warning", title: "Heads up" })

    unmount()
    setFlash({ type: "info", title: "After unmount" })
    store.dispatchEvent(new Event("change"))
    expect(show).toHaveBeenCalledTimes(1)
  })
})
