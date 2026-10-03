import type { Metadata } from "next"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { OrderList } from "@/components/orders/order-list"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { requireUser } from "@/lib/auth-guards"
import { listOrdersForUser } from "@/lib/orders"
import { MAX_ORDERS_PAGE } from "@/lib/validation/orders"

export const metadata: Metadata = { title: "Your orders — Northcart" }

const PAGE_SIZE = 10

/** `?page=N` as a whole number from 1 to MAX_ORDERS_PAGE; anything else is page 1. */
function parsePage(value: string | string[] | undefined) {
  const page = Number(Array.isArray(value) ? value[0] : value)
  return Number.isInteger(page) && page >= 1 && page <= MAX_ORDERS_PAGE ? page : 1
}

export default async function AccountOrdersPage({ searchParams }: PageProps<"/account/orders">) {
  const session = await requireUser("/account/orders")
  const page = parsePage((await searchParams).page)
  const list = await listOrdersForUser(session.user.id, { page, pageSize: PAGE_SIZE })

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/account"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Account
        </Link>
        <h1 className="mb-6 text-3xl font-semibold tracking-tight">Your orders</h1>
        <OrderList list={list} />
      </main>
      <SiteFooter />
    </>
  )
}
