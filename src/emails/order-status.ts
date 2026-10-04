import { COLORS, appUrl, button, escapeHtml, layout, panel, paragraph, textFooter, type EmailContent } from "@/emails/layout"
import { firstNameOf, type EmailOrder } from "@/emails/order-parts"
import { formatPrice } from "@/lib/catalogue"
import type { OrderStatus } from "@/lib/order-rules"

/** Statuses a customer is emailed about (an order starts as `pending`, which the confirmation covers). */
export type EmailedOrderStatus = Exclude<OrderStatus, "pending">

export const isEmailedOrderStatus = (status: OrderStatus): status is EmailedOrderStatus => status !== "pending"

type StatusCopy = { subject: string; title: string; lead: string }

function copyFor(status: EmailedOrderStatus, number: string, byCustomer: boolean): StatusCopy {
  switch (status) {
    case "processing":
      return {
        subject: `We're preparing order ${number}`,
        title: "We're preparing your order",
        lead: "Good news: your order is being picked and packed. We'll let you know as soon as it ships.",
      }
    case "shipped":
      return {
        subject: `Order ${number} is on its way`,
        title: "Your order is on its way",
        lead: "Your order has left our warehouse and is heading to you.",
      }
    case "delivered":
      return {
        subject: `Order ${number} has been delivered`,
        title: "Your order has been delivered",
        lead: "Your order has arrived. We hope you love it! If anything isn't right, just reply to this email.",
      }
    case "cancelled":
      return byCustomer
        ? {
            subject: `You cancelled order ${number}`,
            title: "Your order is cancelled",
            lead: "As you asked, we've cancelled your order. Nothing will ship, and you'll get a full refund to your original payment method within a few days.",
          }
        : {
            subject: `Order ${number} has been cancelled`,
            title: "Your order has been cancelled",
            lead: "We've cancelled your order, so it won't ship. You'll get a full refund to your original payment method within a few days.",
          }
    case "rejected":
      return {
        subject: `We couldn't accept order ${number}`,
        title: "We couldn't accept your order",
        lead: "Sorry, we weren't able to accept your order, so it won't ship. You'll get a full refund to your original payment method within a few days.",
      }
  }
}

/**
 * Sent when an order's status changes. `note` is the admin's note for the change (shown when
 * present); `byCustomer` marks a cancellation the customer made themselves, which gets a
 * confirmation instead of the shop's wording and no note.
 */
export function orderStatusEmail({
  order,
  status,
  note,
  byCustomer = false,
}: {
  order: EmailOrder
  status: EmailedOrderStatus
  note?: string | null
  byCustomer?: boolean
}): EmailContent {
  const copy = copyFor(status, order.number, byCustomer)
  const url = appUrl(`/orders/${encodeURIComponent(order.number)}`)
  const name = firstNameOf(order)
  const shownNote = !byCustomer && note?.trim() ? note.trim() : null
  const tracking = status === "shipped" ? order.trackingNumber : null
  const total = formatPrice(order.totalCents, order.currency)
  const count = order.items.reduce((sum, item) => sum + item.quantity, 0)

  const html = layout({
    title: copy.title,
    preheader: copy.subject,
    body: [
      paragraph(`Hi ${escapeHtml(name)},`),
      paragraph(escapeHtml(copy.lead)),
      tracking
        ? panel(
            "Tracking number",
            `<span style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:15px;font-weight:600;">${escapeHtml(tracking)}</span>`,
          )
        : "",
      shownNote
        ? panel("A note from us", `<span style="white-space:pre-line;">${escapeHtml(shownNote)}</span>`)
        : "",
      paragraph(
        `Order <strong>${escapeHtml(order.number)}</strong> · ${count} item${count === 1 ? "" : "s"} · ${escapeHtml(total)}`,
        `font-size:14px;color:${COLORS.muted};`,
      ),
      button(url, "View your order"),
    ]
      .filter(Boolean)
      .join("\n"),
  })

  const text = [
    `Hi ${name},`,
    copy.lead,
    tracking ? `Tracking number: ${tracking}` : null,
    shownNote ? `A note from us:\n${shownNote}` : null,
    `Order ${order.number} · ${count} item${count === 1 ? "" : "s"} · ${total}`,
    `View your order: ${url}`,
  ]
    .filter(Boolean)
    .join("\n\n")

  return { subject: copy.subject, html, text: text + textFooter() }
}
