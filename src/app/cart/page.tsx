import type { Metadata } from "next"

import { CartView } from "@/components/cart/cart-view"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { getCart } from "@/lib/cart"

export const metadata: Metadata = { title: "Your cart — Northcart" }

// Reads the session and the cart cookie, so it's rendered per request.
export default async function CartPage() {
  const cart = await getCart()

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-6 text-3xl font-semibold tracking-tight">Your cart</h1>
        <CartView cart={cart} />
      </main>
      <SiteFooter />
    </>
  )
}
