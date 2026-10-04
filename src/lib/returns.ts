// The returns policy shown on /help/returns. The window matches the "30-day free returns" promise
// in the header's promo bar, on product pages and on the home page.
export const returnPolicy = {
  windowDays: 30,
  refundBusinessDays: 5,
}

export const returnHighlights = [
  { title: `${returnPolicy.windowDays} days to decide`, text: "The clock starts the day your order is delivered, not the day you placed it." },
  { title: "Free return shipping", text: "We email you a prepaid label. Drop the parcel at any courier point or parcel locker." },
  { title: "Refunds in days", text: `Your money is back on your original payment method within ${returnPolicy.refundBusinessDays} business days of the parcel reaching us.` },
  { title: "Easy exchanges", text: "Need another size or colour? Tell us in your return request and we'll ship it as soon as it's in stock." },
]

export const returnSteps = [
  { title: "Start your return", text: `Send us a message within ${returnPolicy.windowDays} days of delivery with your order number and the items you're sending back.` },
  { title: "Pack it up", text: "Put the items back in their original packaging if you still have it, with any tags and accessories." },
  { title: "Drop it off", text: "Print the prepaid label we email you, stick it on the parcel and drop it at any courier point or locker." },
  { title: "Get your refund", text: `We check the parcel when it arrives and refund you within ${returnPolicy.refundBusinessDays} business days. We'll email you when it's done.` },
]

export const nonReturnable = [
  "In-ear headphones and earbuds once the hygiene seal is broken",
  "Gift cards",
  "Items damaged through misuse, or returned incomplete",
  "Anything returned more than 30 days after delivery",
]

export const returnFaqs = [
  {
    question: "When does the 30-day window start?",
    answer: "On the day your parcel is delivered. If an order arrives in several parcels, each one has its own 30 days.",
  },
  {
    question: "Do I pay for return shipping?",
    answer: "No. Returns from every country we ship to are free: we send you a prepaid label with your return instructions.",
  },
  {
    question: "Is my original shipping refunded?",
    answer: "If you return the whole order, yes: we refund what you paid for shipping too. For a partial return we refund the items you send back.",
  },
  {
    question: "Can I return something I bought on sale or with a discount code?",
    answer: "Yes. Sale items follow the same 30-day policy, and you get back what you actually paid for the item after any discount.",
  },
  {
    question: "My item arrived damaged or faulty. What now?",
    answer: "Sorry about that! Contact us with your order number and a photo of the problem. We'll send a replacement or a full refund, and you won't have to wait for the return to reach us.",
  },
  {
    question: "Can I cancel an order instead?",
    answer: "While an order is still pending you can cancel it yourself from its page under Account → Orders. Once it's being processed, wait for it to arrive and return it.",
  },
]
