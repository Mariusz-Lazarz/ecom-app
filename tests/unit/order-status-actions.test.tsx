import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { OrderActionResult } from "@/app/actions/orders"
import type { OrderStatus } from "@/lib/order-rules"

const changeOrderStatus = vi.fn<(number: string, input: FormData) => Promise<OrderActionResult>>()
vi.mock("@/app/actions/orders", () => ({
  changeOrderStatus: (number: string, input: FormData) => changeOrderStatus(number, input),
}))

const notify = { success: vi.fn(), error: vi.fn() }
vi.mock("@/lib/notify", () => ({ notify }))

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

const { OrderStatusActions } = await import("@/components/admin/order-status-actions")

const EXPECTED_BUTTONS: Record<OrderStatus, string[]> = {
  pending: ["Start processing", "Cancel order", "Reject order"],
  processing: ["Mark as shipped", "Cancel order", "Reject order"],
  shipped: ["Mark as delivered"],
  delivered: [],
  cancelled: [],
  rejected: [],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

async function openDialog(status: OrderStatus, button: string, title: string) {
  const user = userEvent.setup()
  render(<OrderStatusActions number="NC-10001" status={status} />)
  await user.click(screen.getByRole("button", { name: button }))
  const dialog = await screen.findByRole("dialog", { name: title })
  return { user, dialog }
}

const lastInput = () => Object.fromEntries(changeOrderStatus.mock.lastCall![1].entries())

beforeEach(() => {
  changeOrderStatus.mockReset()
  notify.success.mockReset()
  refresh.mockReset()
})

describe("OrderStatusActions", () => {
  it.each(Object.entries(EXPECTED_BUTTONS) as [OrderStatus, string[]][])(
    "offers exactly the allowed changes from %s",
    (status, buttons) => {
      render(<OrderStatusActions number="NC-10001" status={status} />)

      expect(screen.queryAllByRole("button").map((b) => b.textContent)).toEqual(buttons)
      if (buttons.length === 0) {
        expect(screen.getByText("No further actions: this order is final.")).toBeInTheDocument()
      } else {
        expect(screen.queryByText(/No further actions/)).not.toBeInTheDocument()
      }
    },
  )

  it("styles cancel and reject as destructive", () => {
    render(<OrderStatusActions number="NC-10001" status="pending" />)

    // The destructive variant's own classes (the base classes mention destructive for aria-invalid).
    expect(screen.getByRole("button", { name: "Cancel order" }).className).toMatch(/\bbg-destructive\/10\b/)
    expect(screen.getByRole("button", { name: "Reject order" }).className).toMatch(/\bbg-destructive\/10\b/)
    expect(screen.getByRole("button", { name: "Start processing" }).className).not.toMatch(/\bbg-destructive\/10\b/)
  })

  it.each([
    ["processing", "Mark as shipped", "Mark NC-10001 as shipped?", true],
    ["pending", "Start processing", "Start processing NC-10001?", false],
    ["shipped", "Mark as delivered", "Mark NC-10001 as delivered?", false],
    ["processing", "Cancel order", "Cancel order NC-10001?", false],
    ["pending", "Reject order", "Reject order NC-10001?", false],
  ] as const)("from %s, %s asks for a tracking number: %s", async (status, button, title, tracking) => {
    const { dialog } = await openDialog(status, button, title)

    expect(within(dialog).getByLabelText("Note (optional)")).toHaveValue("")
    if (tracking) expect(within(dialog).getByLabelText("Tracking number")).toHaveValue("")
    else expect(within(dialog).queryByLabelText("Tracking number")).not.toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: button })).toHaveAttribute("type", "submit")
  })

  it.each([
    ["Cancel order", "Cancel order NC-10001?"],
    ["Reject order", "Reject order NC-10001?"],
  ])("warns that %s restocks the items", async (button, title) => {
    const { dialog } = await openDialog("pending", button, title)

    expect(dialog).toHaveTextContent("its items go back in stock")
  })

  it("fills a generated tracking number that can still be edited", async () => {
    const { user, dialog } = await openDialog("processing", "Mark as shipped", "Mark NC-10001 as shipped?")
    const input = within(dialog).getByLabelText("Tracking number")

    await user.click(within(dialog).getByRole("button", { name: "Generate" }))
    const generated = (input as HTMLInputElement).value
    expect(generated).toMatch(/^NC1Z[A-Z0-9]{12}$/)

    await user.click(within(dialog).getByRole("button", { name: "Generate" }))
    expect((input as HTMLInputElement).value).toMatch(/^NC1Z[A-Z0-9]{12}$/)
    expect((input as HTMLInputElement).value).not.toBe(generated)

    await user.clear(input)
    await user.type(input, "MANUAL-1")
    expect(input).toHaveValue("MANUAL-1")
  })

  it("submits the status, note and tracking number, shows the pending state, then toasts and closes", async () => {
    const pending = deferred<OrderActionResult>()
    changeOrderStatus.mockReturnValue(pending.promise)
    const { user, dialog } = await openDialog("processing", "Mark as shipped", "Mark NC-10001 as shipped?")

    await user.type(within(dialog).getByLabelText("Tracking number"), "1Z-999")
    await user.type(within(dialog).getByLabelText("Note (optional)"), "Left the warehouse")
    await user.click(within(dialog).getByRole("button", { name: "Mark as shipped" }))

    expect(changeOrderStatus).toHaveBeenCalledOnce()
    expect(changeOrderStatus.mock.lastCall![0]).toBe("NC-10001")
    expect(lastInput()).toEqual({ status: "shipped", trackingNumber: "1Z-999", note: "Left the warehouse" })
    const submit = await within(dialog).findByRole("button", { name: /Saving/ })
    expect(submit).toBeDisabled()
    expect(within(dialog).getByRole("button", { name: "Back" })).toBeDisabled()

    pending.resolve({
      ok: true,
      message: "Order NC-10001 is now shipped.",
      order: { number: "NC-10001", status: "shipped", trackingNumber: "1Z-999" },
    })

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(notify.success).toHaveBeenCalledExactlyOnceWith("Order updated", {
      description: "Order NC-10001 is now shipped.",
    })
    expect(refresh).not.toHaveBeenCalled()
  })

  it("sends an empty note for a plain confirmation", async () => {
    changeOrderStatus.mockResolvedValue({ ok: true, message: "Order NC-10001 is now processing." })
    const { user, dialog } = await openDialog("pending", "Start processing", "Start processing NC-10001?")

    await user.click(within(dialog).getByRole("button", { name: "Start processing" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(lastInput()).toEqual({ status: "processing", note: "" })
  })

  it("shows field errors inline and keeps the dialog open", async () => {
    changeOrderStatus.mockResolvedValue({
      ok: false,
      message: "Please check the status change.",
      errors: { trackingNumber: ["Tracking numbers use letters, digits and dashes only."] },
    })
    const { user, dialog } = await openDialog("processing", "Mark as shipped", "Mark NC-10001 as shipped?")

    await user.type(within(dialog).getByLabelText("Tracking number"), "bad")
    await user.click(within(dialog).getByRole("button", { name: "Mark as shipped" }))

    expect(await within(dialog).findByText("Tracking numbers use letters, digits and dashes only.")).toBeInTheDocument()
    expect(within(dialog).getByLabelText("Tracking number")).toHaveAttribute("aria-invalid", "true")
    expect(within(dialog).getByLabelText("Tracking number")).toHaveValue("bad")
    expect(within(dialog).queryByText("Please check the status change.")).not.toBeInTheDocument()
    expect(notify.success).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("shows a conflict in the dialog and refreshes the page behind it", async () => {
    changeOrderStatus.mockResolvedValue({ ok: false, message: "This order is cancelled and can't be changed to processing." })
    const { user, dialog } = await openDialog("pending", "Start processing", "Start processing NC-10001?")

    await user.click(within(dialog).getByRole("button", { name: "Start processing" }))

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "This order is cancelled and can't be changed to processing.",
    )
    expect(refresh).toHaveBeenCalledOnce()
    expect(notify.success).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("reports a generic error when the action itself fails", async () => {
    changeOrderStatus.mockRejectedValue(new Error("network down"))
    const { user, dialog } = await openDialog("shipped", "Mark as delivered", "Mark NC-10001 as delivered?")

    await user.click(within(dialog).getByRole("button", { name: "Mark as delivered" }))

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Something went wrong")
  })

  it("starts each dialog fresh and sends nothing when the admin backs out", async () => {
    changeOrderStatus.mockResolvedValue({ ok: false, message: "Nope." })
    const { user, dialog } = await openDialog("pending", "Cancel order", "Cancel order NC-10001?")
    await user.type(within(dialog).getByLabelText("Note (optional)"), "Out of stock")
    await user.click(within(dialog).getByRole("button", { name: "Cancel order" }))
    await within(dialog).findByRole("alert")

    await user.click(within(dialog).getByRole("button", { name: "Back" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: "Reject order" }))

    const reject = await screen.findByRole("dialog", { name: "Reject order NC-10001?" })
    expect(within(reject).getByLabelText("Note (optional)")).toHaveValue("")
    expect(within(reject).queryByRole("alert")).not.toBeInTheDocument()
    expect(changeOrderStatus).toHaveBeenCalledOnce()
  })
})
