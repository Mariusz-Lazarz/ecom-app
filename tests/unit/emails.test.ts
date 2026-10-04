import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  isEmailedOrderStatus,
  orderConfirmationEmail,
  orderStatusEmail,
  passwordResetEmail,
  welcomeEmail,
} from "@/emails"
import { appUrl, escapeHtml } from "@/emails/layout"

import { makeOrderDetail } from "./fixtures/orders"

const savedAppUrl = process.env.APP_URL
beforeEach(() => {
  process.env.APP_URL = "https://shop.example/"
})
afterEach(() => {
  if (savedAppUrl === undefined) delete process.env.APP_URL
  else process.env.APP_URL = savedAppUrl
})

const EVIL = `<script>alert("x")</script>`
const ESCAPED_EVIL = "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"

/** Every href in the HTML. */
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1])

describe("escapeHtml and appUrl", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;")
    expect(escapeHtml("")).toBe("")
  })

  it("builds absolute links from APP_URL without doubling slashes", () => {
    expect(appUrl("/orders/NC-1")).toBe("https://shop.example/orders/NC-1")
    expect(appUrl("account")).toBe("https://shop.example/account")
    expect(appUrl()).toBe("https://shop.example/")
  })

  it("falls back to http://localhost:3000 without APP_URL", () => {
    delete process.env.APP_URL
    expect(appUrl("/login")).toBe("http://localhost:3000/login")
  })
})

describe("welcomeEmail", () => {
  it("greets by first name, in HTML and plain text, with absolute links", () => {
    const email = welcomeEmail({ firstName: "Ada" })

    expect(email.subject).toBe("Welcome to Northcart")
    expect(email.html).toContain("Welcome aboard, Ada!")
    expect(email.text).toContain("Welcome aboard, Ada!")
    expect(email.text).toContain("Start shopping: https://shop.example/products")
    expect(hrefs(email.html)).toContain("https://shop.example/products")
    for (const href of hrefs(email.html)) expect(href).toMatch(/^https:\/\/shop\.example\//)
  })

  it("escapes the name in the HTML", () => {
    const email = welcomeEmail({ firstName: EVIL })
    expect(email.html).not.toContain("<script>")
    expect(email.html).toContain(ESCAPED_EVIL)
    // Plain text is never interpreted, so it keeps the name as typed.
    expect(email.text).toContain(EVIL)
  })
})

describe("orderConfirmationEmail", () => {
  const order = makeOrderDetail({
    number: "NC-10042",
    subtotalCents: 4999,
    savingsCents: 1000,
    discountCode: "SAVE10",
    discountCents: 500,
    shippingCents: 599,
    totalCents: 5098,
  })

  it("lists the items with quantities and line totals", () => {
    const { html, text } = orderConfirmationEmail(order)

    expect(html).toContain("Aria ANC Wireless Headphones")
    expect(html).toContain("Halden · 1 × $19.99")
    expect(html).toContain("Fieldnote · 2 × $15.00")
    expect(html).toContain("$30.00")
    expect(text).toContain("- Canvas Tote (Fieldnote) — 2 × $15.00 = $30.00")
  })

  it("shows subtotal, savings, the discount code, shipping and the total", () => {
    const { subject, html, text } = orderConfirmationEmail(order)

    expect(subject).toBe("Order NC-10042 confirmed")
    expect(text).toContain(
      ["Subtotal: $49.99", "You saved: −$10.00", "Discount (SAVE10): −$5.00", "Shipping (Standard): $5.99", "Total: $50.98"].join("\n"),
    )
    for (const part of ["Discount (SAVE10)", "−$5.00", "You saved", "−$10.00", "Shipping (Standard)", "$5.99", "$50.98"]) {
      expect(html).toContain(part)
    }
  })

  it("shows a free-shipping code and free shipping, and leaves out savings and discount when there are none", () => {
    const freeShipping = orderConfirmationEmail({ ...order, discountCode: "SHIPFREE", discountCents: 0, shippingCents: 0 })
    expect(freeShipping.text).toContain("Discount (SHIPFREE): Free shipping")
    expect(freeShipping.text).toContain("Shipping (Standard): Free")

    const plain = orderConfirmationEmail({ ...order, savingsCents: 0, discountCode: null, discountCents: 0 })
    expect(plain.text).not.toContain("You saved")
    expect(plain.text).not.toContain("Discount")
    expect(plain.html).not.toContain("Discount (")
  })

  it("includes the address with the country's name and the payment method", () => {
    const { html, text } = orderConfirmationEmail(order)

    expect(text).toContain("Shipping to:\nAda Lovelace\n12 Analytical Row\nFlat 3\nEC1A 1BB London\nUnited Kingdom\n+44 20 7946 0958")
    expect(html).toContain("12 Analytical Row<br>Flat 3<br>EC1A 1BB London<br>United Kingdom")
    expect(text).toContain("Payment: Digital wallets")
  })

  it("links to the order with an absolute URL", () => {
    const { html, text } = orderConfirmationEmail(order)

    expect(hrefs(html)).toContain("https://shop.example/orders/NC-10042")
    expect(text).toContain("View your order: https://shop.example/orders/NC-10042")
    for (const href of hrefs(html)) expect(href).toMatch(/^https:\/\//)
  })

  it("escapes item names, brands, the address and the greeting", () => {
    const evil = makeOrderDetail({
      customer: { id: "u", name: `${EVIL} Smith`, email: "x@example.com" },
      address: { ...order.address, line1: EVIL },
      items: [{ ...order.items[0], name: EVIL, brand: `"Brand" & Co` }],
    })
    const { html } = orderConfirmationEmail(evil)

    expect(html).not.toContain("<script>")
    expect(html).toContain(ESCAPED_EVIL)
    expect(html).toContain("&quot;Brand&quot; &amp; Co")
  })
})

describe("orderStatusEmail", () => {
  const order = makeOrderDetail({ number: "NC-10050", totalCents: 5598, trackingNumber: "1Z-999-AA1" })

  it("shows the tracking number when the order ships", () => {
    const { subject, html, text } = orderStatusEmail({ order, status: "shipped" })

    expect(subject).toBe("Order NC-10050 is on its way")
    expect(html).toContain("Tracking number")
    expect(html).toContain("1Z-999-AA1")
    expect(text).toContain("Tracking number: 1Z-999-AA1")
    expect(text).toContain("Order NC-10050 · 3 items · $55.98")
  })

  it("leaves the tracking box out when shipped without a tracking number, and for other statuses", () => {
    expect(orderStatusEmail({ order: { ...order, trackingNumber: null }, status: "shipped" }).html).not.toContain("Tracking number")
    expect(orderStatusEmail({ order, status: "delivered" }).text).not.toContain("1Z-999-AA1")
  })

  it.each([
    ["processing", "We're preparing order NC-10050"],
    ["delivered", "Order NC-10050 has been delivered"],
    ["cancelled", "Order NC-10050 has been cancelled"],
    ["rejected", "We couldn't accept order NC-10050"],
  ] as const)("has its own subject for %s", (status, subject) => {
    expect(orderStatusEmail({ order, status }).subject).toBe(subject)
  })

  it("shows the admin's note, escaped, on a rejection", () => {
    const { html, text } = orderStatusEmail({ order, status: "rejected", note: `Address can't be reached ${EVIL}` })

    expect(html).toContain("A note from us")
    expect(html).toContain(`Address can&#39;t be reached ${ESCAPED_EVIL}`)
    expect(html).not.toContain("<script>")
    expect(text).toContain(`A note from us:\nAddress can't be reached ${EVIL}`)
    expect(text).toContain("full refund")
  })

  it("leaves the note box out when the note is empty or blank", () => {
    expect(orderStatusEmail({ order, status: "cancelled", note: null }).html).not.toContain("A note from us")
    expect(orderStatusEmail({ order, status: "cancelled", note: "   " }).html).not.toContain("A note from us")
  })

  it("confirms a customer's own cancellation, without the note", () => {
    const { subject, html, text } = orderStatusEmail({
      order,
      status: "cancelled",
      note: "Cancelled by the customer.",
      byCustomer: true,
    })

    expect(subject).toBe("You cancelled order NC-10050")
    expect(text).toContain("As you asked, we've cancelled your order.")
    expect(html).not.toContain("Cancelled by the customer.")
  })

  it("links to the order with an absolute URL and greets by first name", () => {
    const { html, text } = orderStatusEmail({ order, status: "processing" })

    expect(hrefs(html)).toContain("https://shop.example/orders/NC-10050")
    expect(text).toContain("View your order: https://shop.example/orders/NC-10050")
    expect(text.startsWith("Hi Ada,")).toBe(true)
  })

  it("isn't sent for pending, the status every order starts in", () => {
    expect(isEmailedOrderStatus("pending")).toBe(false)
    for (const status of ["processing", "shipped", "delivered", "cancelled", "rejected"] as const) {
      expect(isEmailedOrderStatus(status)).toBe(true)
    }
  })
})

describe("passwordResetEmail", () => {
  const resetUrl = "https://shop.example/reset-password?token=abc_DEF-123&x=1"

  it("links to the reset URL (escaped in HTML) and says how long it's valid", () => {
    const { subject, html, text } = passwordResetEmail({ firstName: "Ada", resetUrl, expiresInMinutes: 60 })

    expect(subject).toBe("Reset your Northcart password")
    expect(hrefs(html)).toContain("https://shop.example/reset-password?token=abc_DEF-123&amp;x=1")
    expect(text).toContain(`\n${resetUrl}\n`)
    expect(text).toContain("expires in 1 hour")
    expect(html).toContain("expires in 1 hour")
    expect(text).toContain("safely ignore")
  })

  it("words other lifetimes in minutes or hours", () => {
    expect(passwordResetEmail({ firstName: "Ada", resetUrl, expiresInMinutes: 30 }).text).toContain("expires in 30 minutes")
    expect(passwordResetEmail({ firstName: "Ada", resetUrl, expiresInMinutes: 120 }).text).toContain("expires in 2 hours")
  })

  it("escapes the name", () => {
    const { html } = passwordResetEmail({ firstName: EVIL, resetUrl, expiresInMinutes: 60 })
    expect(html).not.toContain("<script>")
    expect(html).toContain(`Hi ${ESCAPED_EVIL},`)
  })
})
