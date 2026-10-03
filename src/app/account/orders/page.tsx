import type { Metadata } from "next"

import { OrderList } from "@/components/orders/order-list"
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
    <div className="max-w-4xl">
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">Your orders</h1>
      <OrderList list={list} />
    </div>
  )
}
