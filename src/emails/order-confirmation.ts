import { appUrl, button, escapeHtml, layout, panel, paragraph, textFooter, type EmailContent } from "@/emails/layout"
import {
  addressLines,
  addressPanel,
  firstNameOf,
  itemsTable,
  orderText,
  totalsTable,
  type EmailOrder,
} from "@/emails/order-parts"

/** Sent once an order is placed: items, totals (with any discount), address and a link to the order. */
export function orderConfirmationEmail(order: EmailOrder): EmailContent {
  const subject = `Order ${order.number} confirmed`
  const url = appUrl(`/orders/${encodeURIComponent(order.number)}`)
  const name = firstNameOf(order)

  const html = layout({
    title: "Thanks for your order!",
    preheader: `Order ${order.number} is confirmed. We'll email you when it ships.`,
    body: [
      paragraph(`Hi ${escapeHtml(name)}, we've received your order <strong>${escapeHtml(order.number)}</strong> and it's paid. We'll email you again as soon as it ships.`),
      itemsTable(order),
      totalsTable(order),
      addressPanel(order.address),
      panel("Payment", escapeHtml(order.paymentMethod.name)),
      button(url, "View your order"),
    ].join("\n"),
  })

  const text = `Hi ${name},

Thanks for your order! We've received order ${order.number} and it's paid. We'll email you again as soon as it ships.

${orderText(order)}

Shipping to:
${addressLines(order.address).join("\n")}

Payment: ${order.paymentMethod.name}

View your order: ${url}${textFooter()}`

  return { subject, html, text }
}
