import "server-only"

import { formatPrice } from "@/lib/catalogue"
import { ORDER_STATUS_LABELS } from "@/lib/order-rules"
import * as orders from "@/lib/orders"

/**
 * What the support agent's tools return (served by `/api/mcp`). The user id always comes from the
 * agent's token, never from the tool's arguments, and the domain functions only ever return that
 * user's orders. Each view holds what the agent needs to answer, and nothing more: no address
 * lines, phone, email or internal ids, since whatever a tool returns goes to the model and stays in
 * HarnessLab's audit log.
 */

export const AGENT_ORDERS_PAGE_SIZE = 10

export type AgentOrderSummary = {
  number: string
  status: string
  placedAt: string
  items: number
  total: string
}

export type AgentOrderList = {
  orders: AgentOrderSummary[]
  page: number
  pageCount: number
  totalOrders: number
}

export type AgentOrderDetail = AgentOrderSummary & {
  lastUpdatedAt: string
  lines: { product: string; brand: string; quantity: number; lineTotal: string }[]
  subtotal: string
  discount: string | null
  shipping: string
  shippingMethod: string
  paymentMethod: string
  trackingNumber: string | null
  // City and country only.
  shipTo: string
  history: { status: string; at: string; note: string | null }[]
}

function summary(order: orders.OrderSummary): AgentOrderSummary {
  return {
    number: order.number,
    status: ORDER_STATUS_LABELS[order.status],
    placedAt: order.createdAt.toISOString(),
    items: order.itemCount,
    total: formatPrice(order.totalCents, order.currency),
  }
}

/** The user's orders, newest first, AGENT_ORDERS_PAGE_SIZE per page. */
export async function listMyOrders(userId: string, page = 1): Promise<AgentOrderList> {
  const result = await orders.listOrdersForUser(userId, { page, pageSize: AGENT_ORDERS_PAGE_SIZE })
  return {
    orders: result.items.map(summary),
    page: result.page,
    pageCount: result.pageCount,
    totalOrders: result.total,
  }
}

/** One of the user's orders, or null when it doesn't exist or isn't theirs. */
export async function getMyOrder(userId: string, number: string): Promise<AgentOrderDetail | null> {
  const order = await orders.getOrderForUser(userId, number)
  if (!order) return null
  const money = (cents: number) => formatPrice(cents, order.currency)
  return {
    ...summary(order),
    lastUpdatedAt: order.updatedAt.toISOString(),
    lines: order.items.map((item) => ({
      product: item.name,
      brand: item.brand,
      quantity: item.quantity,
      lineTotal: money(item.lineTotalCents),
    })),
    subtotal: money(order.subtotalCents),
    discount: order.discountCode ? `${order.discountCode} (−${money(order.discountCents)})` : null,
    shipping: order.shippingCents === 0 ? "Free" : money(order.shippingCents),
    shippingMethod: order.shippingMethod.name,
    paymentMethod: order.paymentMethod.name,
    trackingNumber: order.trackingNumber,
    shipTo: `${order.address.city}, ${order.address.country}`,
    history: order.events.map((event) => ({
      status: ORDER_STATUS_LABELS[event.status],
      at: event.createdAt.toISOString(),
      note: event.note,
    })),
  }
}
