import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft } from "lucide-react"

import { CheckoutForm } from "@/components/checkout/checkout-form"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { requireUser } from "@/lib/auth-guards"
import { getCart } from "@/lib/cart"
import { getLatestShippingAddress } from "@/lib/orders"
import type { CheckoutValues } from "@/lib/validation/checkout"

export const metadata: Metadata = { title: "Checkout — Northcart" }

// Signed-in only (back here after logging in); an empty cart goes back to /cart.
export default async function CheckoutPage() {
  const session = await requireUser("/checkout")
  const [cart, lastAddress] = await Promise.all([getCart(), getLatestShippingAddress(session.user.id)])
  if (cart.items.length === 0) redirect("/cart")

  // The last order's address, or just the account's name for a first order.
  const defaults: CheckoutValues = lastAddress
    ? { ...lastAddress, line2: lastAddress.line2 ?? "" }
    : { fullName: session.user.name ?? "" }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/cart"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to cart
        </Link>
        <h1 className="mb-6 text-3xl font-semibold tracking-tight">Checkout</h1>
        <CheckoutForm cart={cart} defaults={defaults} />
      </main>
      <SiteFooter />
    </>
  )
}
