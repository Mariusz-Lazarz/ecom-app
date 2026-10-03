import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { OrderActionResult } from "@/app/actions/orders"

const cancelOrder = vi.fn<(number: string) => Promise<OrderActionResult>>()
vi.mock("@/app/actions/orders", () => ({ cancelOrder: (number: string) => cancelOrder(number) }))

const notify = { success: vi.fn(), error: vi.fn() }
vi.mock("@/lib/notify", () => ({ notify }))

const { CancelOrderButton } = await import("@/components/orders/cancel-order-button")

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

async function openDialog() {
  const user = userEvent.setup()
  render(<CancelOrderButton number="NC-10001" />)
  await user.click(screen.getByRole("button", { name: "Cancel order" }))
  const dialog = await screen.findByRole("alertdialog", { name: "Cancel order NC-10001?" })
  return { user, dialog }
}

beforeEach(() => {
  cancelOrder.mockReset()
  notify.success.mockReset()
  notify.error.mockReset()
})

describe("CancelOrderButton", () => {
  it("asks for confirmation and does nothing when the customer keeps the order", async () => {
    const { user, dialog } = await openDialog()

    expect(dialog).toHaveTextContent("its items go back in stock")
    await user.click(within(dialog).getByRole("button", { name: "Keep order" }))

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(cancelOrder).not.toHaveBeenCalled()
    expect(notify.success).not.toHaveBeenCalled()
  })

  it("cancels on confirm, shows the pending state and toasts the result", async () => {
    const pending = deferred<OrderActionResult>()
    cancelOrder.mockReturnValue(pending.promise)
    const { user, dialog } = await openDialog()

    await user.click(within(dialog).getByRole("button", { name: "Cancel order" }))

    expect(cancelOrder).toHaveBeenCalledExactlyOnceWith("NC-10001")
    const confirm = await within(dialog).findByRole("button", { name: /Cancelling/ })
    expect(confirm).toBeDisabled()
    expect(within(dialog).getByRole("button", { name: "Keep order" })).toBeDisabled()

    pending.resolve({
      ok: true,
      message: "Order NC-10001 has been cancelled.",
      order: { number: "NC-10001", status: "cancelled", trackingNumber: null },
    })

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(notify.success).toHaveBeenCalledExactlyOnceWith("Order cancelled", {
      description: "Order NC-10001 has been cancelled.",
    })
    expect(notify.error).not.toHaveBeenCalled()
  })

  it("toasts the action's error message when the order can't be cancelled", async () => {
    const message = "This order is already processing, so it can't be cancelled online. Contact us if you need help."
    cancelOrder.mockResolvedValue({ ok: false, message })
    const { user, dialog } = await openDialog()

    await user.click(within(dialog).getByRole("button", { name: "Cancel order" }))

    await waitFor(() => expect(notify.error).toHaveBeenCalledExactlyOnceWith("Couldn't cancel the order", { description: message }))
    expect(notify.success).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
  })

  it("toasts a generic error when the action itself fails", async () => {
    cancelOrder.mockRejectedValue(new Error("network down"))
    const { user, dialog } = await openDialog()

    await user.click(within(dialog).getByRole("button", { name: "Cancel order" }))

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledExactlyOnceWith("Couldn't cancel the order", {
        description: "Something went wrong. Please try again.",
      }),
    )
  })
})
