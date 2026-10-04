import { COLORS, escapeHtml, panel } from "@/emails/layout"
import { formatPrice } from "@/lib/catalogue"
import type { OrderDetail } from "@/lib/orders"
import { SUPPORTED_COUNTRIES } from "@/lib/validation/checkout"

/** The parts of an order the order emails show. */
export type EmailOrder = Pick<
  OrderDetail,
  | "number"
  | "customer"
  | "address"
  | "items"
  | "subtotalCents"
  | "savingsCents"
  | "discountCode"
  | "discountCents"
  | "shippingCents"
  | "totalCents"
  | "currency"
  | "shippingMethod"
  | "paymentMethod"
  | "trackingNumber"
>

/** The first word of the customer's name, for the greeting. */
export const firstNameOf = (order: Pick<EmailOrder, "customer">) => order.customer.name.trim().split(/\s+/)[0] || "there"

const countryName = (code: string) => SUPPORTED_COUNTRIES.find((country) => country.code === code)?.name ?? code

/** The shipping address, one line per entry. */
export function addressLines(address: EmailOrder["address"]) {
  return [
    address.fullName,
    address.line1,
    address.line2,
    `${address.postalCode} ${address.city}`,
    countryName(address.country),
    address.phone,
  ].filter((line): line is string => Boolean(line))
}

export function addressPanel(address: EmailOrder["address"]) {
  return panel("Shipping to", addressLines(address).map(escapeHtml).join("<br>"))
}

/** Label/amount rows of the totals, as the order page shows them. */
export function totalRows(order: EmailOrder): { label: string; amount: string; tone?: "success" | "strong" }[] {
  const price = (cents: number) => formatPrice(cents, order.currency)
  const rows: ReturnType<typeof totalRows> = [{ label: "Subtotal", amount: price(order.subtotalCents) }]
  if (order.savingsCents > 0) rows.push({ label: "You saved", amount: `−${price(order.savingsCents)}`, tone: "success" })
  if (order.discountCode) {
    rows.push({
      label: `Discount (${order.discountCode})`,
      amount: order.discountCents > 0 ? `−${price(order.discountCents)}` : "Free shipping",
      tone: "success",
    })
  }
  rows.push({
    label: `Shipping (${order.shippingMethod.name})`,
    amount: order.shippingCents === 0 ? "Free" : price(order.shippingCents),
  })
  rows.push({ label: "Total", amount: price(order.totalCents), tone: "strong" })
  return rows
}

export function itemsTable(order: EmailOrder) {
  const cell = "padding:12px 0;border-bottom:1px solid " + COLORS.border + ";font-size:14px;line-height:20px;vertical-align:top;"
  const rows = order.items
    .map(
      (item) => `<tr>
    <td style="${cell}">
      <div style="font-weight:600;color:${COLORS.text};">${escapeHtml(item.name)}</div>
      <div style="color:${COLORS.muted};font-size:13px;">${escapeHtml(item.brand)} · ${item.quantity} × ${escapeHtml(formatPrice(item.unitPriceCents, order.currency))}</div>
    </td>
    <td align="right" style="${cell}white-space:nowrap;padding-left:12px;font-weight:600;">${escapeHtml(formatPrice(item.lineTotalCents, order.currency))}</td>
  </tr>`,
    )
    .join("\n")
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border-top:1px solid ${COLORS.border};">
${rows}
</table>`
}

export function totalsTable(order: EmailOrder) {
  const rows = totalRows(order)
    .map((row) => {
      const color = row.tone === "success" ? COLORS.success : COLORS.text
      const strong = row.tone === "strong"
      const style = `padding:${strong ? "12px 0 0" : "4px 0"};font-size:${strong ? 16 : 14}px;line-height:22px;color:${color};${strong ? `font-weight:700;border-top:1px solid ${COLORS.border};` : ""}`
      return `<tr><td style="${style}">${escapeHtml(row.label)}</td><td align="right" style="${style}white-space:nowrap;">${escapeHtml(row.amount)}</td></tr>`
    })
    .join("\n")
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
${rows}
</table>`
}

/** Items and totals as plain text. */
export function orderText(order: EmailOrder) {
  const items = order.items
    .map(
      (item) =>
        `- ${item.name} (${item.brand}) — ${item.quantity} × ${formatPrice(item.unitPriceCents, order.currency)} = ${formatPrice(item.lineTotalCents, order.currency)}`,
    )
    .join("\n")
  const totals = totalRows(order)
    .map((row) => `${row.label}: ${row.amount}`)
    .join("\n")
  return `${items}\n\n${totals}`
}
