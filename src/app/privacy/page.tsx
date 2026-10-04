import type { Metadata } from "next"
import Link from "next/link"

import { PolicyPage } from "@/components/content/policy-page"
import { siteConfig } from "@/lib/data"

export const metadata: Metadata = {
  title: "Privacy policy — Northcart",
  description: `What ${siteConfig.name} stores about you, which cookies it uses and how emails are sent.`,
}

const sections = [
  { id: "summary", title: "The short version" },
  { id: "data", title: "What we store" },
  { id: "cookies", title: "Cookies and local storage" },
  { id: "emails", title: "Emails" },
  { id: "sharing", title: "Who sees your data" },
  { id: "rights", title: "Your choices" },
  { id: "contact", title: "Contact" },
]

const cookies = [
  { name: "cart_id", kind: "Cookie, httpOnly", lasts: "30 days, renewed when you add to your cart", purpose: "Remembers a guest's cart. Ignored once you sign in." },
  { name: "authjs.session-token", kind: "Cookie, httpOnly", lasts: "Until you sign out, or 30 days", purpose: "Keeps you signed in (a signed token with your name, email and role)." },
  { name: "authjs.csrf-token, authjs.callback-url", kind: "Cookies, httpOnly", lasts: "Your browser session", purpose: "Protect the sign-in form and remember where to send you afterwards." },
  { name: "flash", kind: "Cookie", lasts: "1 minute at most", purpose: "Carries a one-off notification (like “Order placed”) to the next page, then is deleted." },
  { name: "theme", kind: "localStorage", lasts: "Until you clear it", purpose: "Your light, dark or system theme choice. Never sent to us." },
]

export default function PrivacyPage() {
  return (
    <PolicyPage
      title="Privacy policy"
      updated="4 October 2026"
      intro={
        <p>
          {siteConfig.name} is a demo store. We keep only what the shop needs to work, never sell it, and use no
          analytics or advertising trackers.
        </p>
      }
      sections={sections}
    >
      <h2 id="summary">The short version</h2>
      <ul>
        <li>We store your account, orders, addresses, cart, wishlist and reviews so the shop works.</li>
        <li>We use a few strictly necessary cookies and one localStorage entry, and nothing for tracking.</li>
        <li>Passwords, reset links and unsubscribe links are stored only as one-way hashes.</li>
        <li>You can change your details, delete addresses and unsubscribe at any time.</li>
      </ul>

      <h2 id="data">What we store</h2>
      <h3>Your account</h3>
      <p>
        Your first and last name, email address, a bcrypt hash of your password (never the password itself), your
        role and when you joined. Password reset links are stored as a SHA-256 hash and expire after an hour.
      </p>
      <h3>Shopping</h3>
      <p>
        Your cart and wishlist; saved addresses (name, street, city, postal code, country and phone); and for
        every order, a copy of the shipping address, the items and prices, the shipping and payment method you
        picked, any discount code and the order&apos;s status history. Payments are simulated: we never ask for or
        store card details.
      </p>
      <h3>Reviews</h3>
      <p>Your rating, title and text, shown on the product page with your first name and last initial.</p>
      <h3>Newsletter</h3>
      <p>
        If you subscribe: your email address, whether you&apos;re subscribed, where you signed up (the home page or
        registration) and when. The unsubscribe link in our emails carries a random token we store only as a
        hash.
      </p>
      <h3>Messages to us</h3>
      <p>
        What you send through the <Link href="/help/contact">contact form</Link>: your name, email, topic, message
        and an optional order number, linked to your account if you were signed in. We also keep a SHA-256 hash of
        your IP address for a minute&apos;s worth of spam protection; we can&apos;t turn it back into your IP.
      </p>

      <h2 id="cookies">Cookies and local storage</h2>
      <p>Everything below is needed for the shop to work, so there&apos;s no cookie banner to click through.</p>
      <div className="mb-4 overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-xl text-left text-sm">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Name</th>
              <th scope="col" className="px-4 py-3 font-medium">Type</th>
              <th scope="col" className="px-4 py-3 font-medium">Lasts</th>
              <th scope="col" className="px-4 py-3 font-medium">What it&apos;s for</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {cookies.map((cookie) => (
              <tr key={cookie.name} className="align-top">
                <th scope="row" className="px-4 py-3 font-mono text-xs font-medium text-foreground">{cookie.name}</th>
                <td className="px-4 py-3">{cookie.kind}</td>
                <td className="px-4 py-3">{cookie.lasts}</td>
                <td className="px-4 py-3">{cookie.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        In production the session cookies get a <code>__Secure-</code> prefix and are only sent over HTTPS.
      </p>

      <h2 id="emails">Emails</h2>
      <p>
        We email you when you create an account, place an order, when an order&apos;s status changes, when you
        ask to reset your password, subscribe to the newsletter or contact us. When running locally, every email
        is caught by Mailpit, a development mail server, and never leaves your machine. A real deployment would
        send them through an SMTP provider.
      </p>

      <h2 id="sharing">Who sees your data</h2>
      <p>
        Only the shop&apos;s admins, to fulfil orders, moderate reviews and answer messages. Product photos are
        served from our own media storage. We don&apos;t share or sell your data, and we don&apos;t load third-party
        analytics, ads or social widgets.
      </p>

      <h2 id="rights">Your choices</h2>
      <ul>
        <li>
          Change your name, email and password under <Link href="/account/profile">Account → Profile</Link> and{" "}
          <Link href="/account/security">Security</Link>.
        </li>
        <li>
          Edit or delete saved addresses under <Link href="/account/addresses">Account → Addresses</Link>.
        </li>
        <li>Unsubscribe from the newsletter with the link at the bottom of any newsletter email.</li>
        <li>
          Clear the <code>theme</code> entry and cookies from your browser whenever you like; you&apos;ll just be
          signed out and your guest cart forgotten.
        </li>
        <li>Ask us for a copy of your data, or to delete your account, through the contact form.</li>
      </ul>

      <h2 id="contact">Contact</h2>
      <p>
        Questions about this policy? <Link href="/help/contact">Send us a message</Link> and a person will reply,
        usually within one business day.
      </p>
    </PolicyPage>
  )
}
