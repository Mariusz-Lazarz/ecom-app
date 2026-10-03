import type { OrderStatus } from "@/lib/order-rules"
import type { OrderDetail, OrderEvent, OrderSummary } from "@/lib/orders"

let next = 0

/** An order list row; override what a test cares about. */
export function makeOrderSummary(overrides: Partial<OrderSummary> = {}): OrderSummary {
  next += 1
  return {
    id: `00000000-0000-4000-9000-${String(next).padStart(12, "0")}`,
    number: `NC-${10000 + next}`,
    status: "pending",
    itemCount: 1,
    totalCents: 2599,
    discountCode: null,
    discountCents: 0,
    currency: "USD",
    createdAt: new Date("2026-09-20T10:00:00Z"),
    updatedAt: new Date("2026-09-20T10:00:00Z"),
    ...overrides,
  }
}

export function makeEvent(status: OrderStatus, createdAt: string, note: string | null = null): OrderEvent {
  next += 1
  return { id: `event-${next}`, status, actorRole: "admin", actorUserId: null, note, createdAt: new Date(createdAt) }
}

/** A full order as getOrderForUser returns it: two lines, standard shipping, one pending event. */
export function makeOrderDetail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  const summary = makeOrderSummary({ itemCount: 3, totalCents: 5598 })
  return {
    ...summary,
    customer: { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
    address: {
      fullName: "Ada Lovelace",
      line1: "12 Analytical Row",
      line2: "Flat 3",
      city: "London",
      postalCode: "EC1A 1BB",
      country: "GB",
      phone: "+44 20 7946 0958",
    },
    shippingMethod: { id: "standard", name: "Standard", priceCents: 599 },
    paymentMethod: { id: "wallets", name: "Digital wallets" },
    subtotalCents: 4999,
    savingsCents: 1000,
    shippingCents: 599,
    trackingNumber: null,
    items: [
      {
        id: "item-1",
        productId: "p1",
        name: "Aria ANC Wireless Headphones",
        slug: "aria",
        brand: "Halden",
        image: { url: "http://localhost:9090/media/products/aria.webp", alt: "Aria ANC Wireless Headphones" },
        unitPriceCents: 1999,
        compareAtCents: 2999,
        quantity: 1,
        lineTotalCents: 1999,
      },
      {
        id: "item-2",
        productId: null,
        name: "Canvas Tote",
        slug: "tote",
        brand: "Fieldnote",
        image: null,
        unitPriceCents: 1500,
        compareAtCents: null,
        quantity: 2,
        lineTotalCents: 3000,
      },
    ],
    events: [makeEvent("pending", "2026-09-20T10:00:00Z")],
    ...overrides,
  }
}
