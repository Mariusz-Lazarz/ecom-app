// Pay-in-4 rules shown on /help/payments. Orders outside this range can't be split.
export const payLater = {
  instalments: 4,
  intervalWeeks: 2,
  minTotal: 50,
  maxTotal: 1500,
}

export type Instalment = { label: string; amount: number }

// Splits a total into equal instalments in whole cents; any leftover cents go on the first payment
// so the parts always add up to the exact total.
export function splitIntoInstalments(total: number): Instalment[] {
  const { instalments, intervalWeeks } = payLater
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / instalments)
  const remainder = cents - base * instalments

  return Array.from({ length: instalments }, (_, i) => ({
    label: i === 0 ? "Today" : `In ${i * intervalWeeks} weeks`,
    amount: (i === 0 ? base + remainder : base) / 100,
  }))
}

export type PaymentMethod = {
  id: string
  name: string
  description: string
  brands: string[]
  badge?: string
}

export const paymentMethods: PaymentMethod[] = [
  {
    id: "cards",
    name: "Credit & debit cards",
    description: "All major cards, charged only when your order ships. 3-D Secure keeps every payment verified.",
    brands: ["Visa", "Mastercard", "American Express", "Discover"],
  },
  {
    id: "wallets",
    name: "Digital wallets",
    description: "Check out in two taps with the wallet already on your phone — no card number to type.",
    brands: ["Apple Pay", "Google Pay", "PayPal"],
    badge: "Fastest",
  },
  {
    id: "pay-later",
    name: "Northcart Pay-in-4",
    description: `Split orders from $${payLater.minTotal} to $${payLater.maxTotal.toLocaleString("en-US")} into ${payLater.instalments} interest-free payments, one every ${payLater.intervalWeeks} weeks.`,
    brands: ["0% interest", "No fees when on time"],
    badge: "Popular",
  },
  {
    id: "gift-cards",
    name: "Gift cards & store credit",
    description: "Redeem Northcart gift cards or refund credit at checkout and pay any balance another way.",
    brands: ["Gift cards", "Store credit"],
  },
]

export const securityPoints = [
  { title: "256-bit SSL encryption", text: "Everything you send us travels over an encrypted connection." },
  { title: "PCI DSS Level 1", text: "Card details go straight to our payment partner — we never store them." },
  { title: "3-D Secure", text: "Your bank may ask you to confirm larger payments in its app." },
  { title: "Buyer protection", text: "Item not as described or never arrived? You get your money back." },
]

export const paymentFaqs = [
  {
    question: "When will I be charged?",
    answer:
      "We place a hold on your card when you order and only take the money once your parcel ships. Pay-in-4 takes the first payment on the day you order.",
  },
  {
    question: "Which currencies do you accept?",
    answer:
      "Prices are in US dollars. Cards issued elsewhere work too — your bank converts the amount at its own rate.",
  },
  {
    question: "What happens if a Pay-in-4 payment fails?",
    answer:
      "We'll email you and retry two days later. There are no late fees on your first missed payment; after that a $7 fee applies.",
  },
  {
    question: "How do refunds work?",
    answer:
      "Refunds go back to the method you paid with within 5–10 business days. For Pay-in-4, remaining instalments are cancelled first.",
  },
  {
    question: "Can I pay with more than one method?",
    answer:
      "Yes — combine a gift card or store credit with any other method. Cards and wallets can't be split with each other.",
  },
]
