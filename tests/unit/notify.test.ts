import { beforeEach, describe, expect, it, vi } from "vitest"

const toast = vi.hoisted(() => ({
  success: vi.fn(() => 1),
  error: vi.fn(() => 2),
  warning: vi.fn(() => 3),
  info: vi.fn(() => 4),
  promise: vi.fn(),
  dismiss: vi.fn(),
}))

vi.mock("sonner", () => ({ toast }))

const { notify } = await import("@/lib/notify")

describe("notify", () => {
  beforeEach(() => {
    for (const fn of Object.values(toast)) fn.mockClear()
  })

  it.each(["success", "error", "warning", "info"] as const)("%s forwards the title and options and returns the id", (type) => {
    const onClick = vi.fn()
    const options = { description: "More", duration: 5000, action: { label: "Undo", onClick } }

    const id = notify[type]("Title", options)

    expect(toast[type]).toHaveBeenCalledExactlyOnceWith("Title", options)
    expect(id).toBe({ success: 1, error: 2, warning: 3, info: 4 }[type])
  })

  it("show picks the toast variant from the notification type", () => {
    notify.show({ type: "warning", title: "Low stock", description: "Only 2 left." })
    notify.show({ type: "error", title: "Failed" })

    expect(toast.warning).toHaveBeenCalledExactlyOnceWith("Low stock", { description: "Only 2 left." })
    expect(toast.error).toHaveBeenCalledExactlyOnceWith("Failed", { description: undefined })
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("promise passes the promise and messages through", () => {
    const promise = Promise.resolve(3)
    const messages = { loading: "Saving…", success: (n: number) => `Saved ${n}`, error: "Failed" }

    notify.promise(promise, messages)

    expect(toast.promise).toHaveBeenCalledExactlyOnceWith(promise, messages)
  })

  it("dismiss closes one toast by id, or all without one", () => {
    notify.dismiss(7)
    notify.dismiss()

    expect(toast.dismiss.mock.calls).toEqual([[7], [undefined]])
  })
})
