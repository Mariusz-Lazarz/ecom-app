import type { Metadata } from "next"
import Link from "next/link"

import { PolicyPage } from "@/components/content/policy-page"
import { siteConfig } from "@/lib/data"
import { returnPolicy } from "@/lib/returns"
import { shippingRules } from "@/lib/shipping"

export const metadata: Metadata = {
  title: "Terms of service — Northcart",
  description: `The rules for using ${siteConfig.name}, a demo store: orders, prices, returns and reviews.`,
}

const sections = [
  { id: "demo", title: "A demo store" },
  { id: "account", title: "Your account" },
  { id: "orders", title: "Orders and prices" },
  { id: "shipping-returns", title: "Shipping and returns" },
  { id: "discounts", title: "Discount codes" },
  { id: "reviews", title: "Reviews" },
  { id: "changes", title: "Changes" },
]

export default function TermsPage() {
  return (
    <PolicyPage
      title="Terms of service"
      updated="4 October 2026"
      intro={<p>The ground rules for shopping at {siteConfig.name}. Short, and in plain English.</p>}
      sections={sections}
    >
      <h2 id="demo">A demo store</h2>
      <p>
        {siteConfig.name} is a practice project. The products, brands and prices are made up, payments are
        simulated and no parcels are ever shipped. Placing an order doesn&apos;t create a contract or charge you
        anything.
      </p>

      <h2 id="account">Your account</h2>
      <p>
        You need an account to check out, keep a wishlist or write reviews. Keep your password to yourself; you&apos;re
        responsible for what happens under your account. We may close accounts used to abuse the shop or other
        customers. See the <Link href="/privacy">privacy policy</Link> for what we store.
      </p>

      <h2 id="orders">Orders and prices</h2>
      <ul>
        <li>Prices are in US dollars and include everything shown at checkout: items, shipping and any discount.</li>
        <li>Stock is reserved when you place an order. If something sells out first, checkout tells you before anything is placed.</li>
        <li>
          You can cancel an order yourself while it&apos;s pending. After that, we may still cancel or reject an order,
          for example if an item turns out to be damaged in our warehouse; reserved stock goes back on sale.
        </li>
      </ul>

      <h2 id="shipping-returns">Shipping and returns</h2>
      <p>
        Standard shipping is free on orders over ${shippingRules.freeThreshold}; the other options and delivery times
        are on the <Link href="/help/shipping">shipping page</Link>. You can return most items within{" "}
        {returnPolicy.windowDays} days of delivery for free, as described on the{" "}
        <Link href="/help/returns">returns page</Link>.
      </p>

      <h2 id="discounts">Discount codes</h2>
      <p>
        One code per order. Each code has its own minimum spend, dates and limits, shown when you apply it. A
        cancelled or rejected order gives the code&apos;s use back.
      </p>

      <h2 id="reviews">Reviews</h2>
      <p>
        You can review products from orders that were delivered to you. Keep it honest and about the product: we
        hide reviews that are spam, abusive or share personal details.
      </p>

      <h2 id="changes">Changes</h2>
      <p>
        We may update these terms as the shop changes; the date at the top says when. Questions?{" "}
        <Link href="/help/contact">Contact us</Link>.
      </p>
    </PolicyPage>
  )
}
