// Shipping rules and options shown on /help/shipping.
export const shippingRules = {
  freeThreshold: 50,
  cutoffHour: 14,
}

export type ShippingMethod = {
  id: string
  name: string
  description: string
  price: number
  minDays: number
  maxDays: number
  // Whether orders at or above freeThreshold ship with this method for free.
  freeEligible: boolean
  badge?: string
}

export const shippingMethods: ShippingMethod[] = [
  {
    id: "standard",
    name: "Standard",
    description: "Tracked delivery by our courier partners, straight to your door.",
    price: 5.99,
    minDays: 3,
    maxDays: 5,
    freeEligible: true,
    badge: `Free over $${shippingRules.freeThreshold}`,
  },
  {
    id: "express",
    name: "Express",
    description: "Priority handling and a two-hour delivery window sent the morning it arrives.",
    price: 12.99,
    minDays: 1,
    maxDays: 2,
    freeEligible: false,
    badge: "Popular",
  },
  {
    id: "next-day",
    name: "Next day",
    description: "Order before 2 pm on a weekday and it's with you the next business day.",
    price: 19.99,
    minDays: 1,
    maxDays: 1,
    freeEligible: false,
  },
  {
    id: "pickup",
    name: "Parcel locker pickup",
    description: "Collect from any of 4,000+ partner lockers whenever suits you, 24/7.",
    price: 0,
    minDays: 2,
    maxDays: 4,
    freeEligible: false,
    badge: "Always free",
  },
]

// Cost of shipping an order with the given method; eligible methods are free at or above the threshold.
export function shippingCost(subtotal: number, method: ShippingMethod): number {
  if (method.freeEligible && subtotal >= shippingRules.freeThreshold) return 0
  return method.price
}

// How much more the customer has to spend to unlock free standard shipping, in whole cents.
export function amountToFreeShipping(subtotal: number): number {
  const cents = Math.round(shippingRules.freeThreshold * 100) - Math.round(subtotal * 100)
  return Math.max(0, cents) / 100
}

export function formatDeliveryWindow({ minDays, maxDays }: Pick<ShippingMethod, "minDays" | "maxDays">): string {
  if (minDays === maxDays) return `${minDays} business ${minDays === 1 ? "day" : "days"}`
  return `${minDays}–${maxDays} business days`
}

export type ShippingZone = {
  region: string
  time: string
  price: string
}

export const shippingZones: ShippingZone[] = [
  { region: "United States", time: "1–5 business days", price: `Free over $${shippingRules.freeThreshold}` },
  { region: "Canada", time: "4–8 business days", price: "$14.99" },
  { region: "United Kingdom & EU", time: "5–9 business days", price: "$19.99" },
  { region: "Rest of the world", time: "7–14 business days", price: "$29.99" },
]

export const trackingSteps = [
  { title: "Order placed", text: "You get a confirmation email with your order number straight away." },
  { title: "Packed & dispatched", text: "Orders in by 2 pm leave our warehouse the same day." },
  { title: "In transit", text: "Follow your parcel live with the tracking link we send by email and SMS." },
  { title: "Delivered", text: "Not home? Your courier leaves it somewhere safe or at the nearest locker." },
]

export const shippingFaqs = [
  {
    question: "When will my order ship?",
    answer:
      "Orders placed before 2 pm on a business day leave our warehouse the same day. Anything later ships the next business day.",
  },
  {
    question: "How do I track my parcel?",
    answer:
      "As soon as your order ships we email and text you a tracking link. You can also find it under Orders in your account.",
  },
  {
    question: "Can I change my delivery address?",
    answer:
      "Yes, until the order is packed. After that, use the tracking link to redirect the parcel to a locker or a neighbour.",
  },
  {
    question: "Do you charge customs or import duties?",
    answer:
      "US and Canadian orders arrive duty-paid. For other international orders, local duties and taxes are collected on delivery.",
  },
  {
    question: "What if my parcel arrives damaged or never shows up?",
    answer:
      "Let us know within 14 days and we'll send a replacement or refund you in full — no need to return a damaged item.",
  },
]
