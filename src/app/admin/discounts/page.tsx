import type { Metadata } from "next"
import Link from "next/link"
import { Plus, TicketPercent } from "lucide-react"

import { DiscountCodeTable } from "@/components/admin/discount-code-table"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requireAdmin } from "@/lib/auth-guards"
import { listDiscountCodes } from "@/lib/discounts"
import { ADMIN_DISCOUNTS_PATH } from "@/lib/validation/discounts"

export const metadata: Metadata = { title: "Discount codes — Admin — Northcart" }

/** Every discount code, newest first, with its usage and an on/off switch. */
export default async function AdminDiscountsPage() {
  await requireAdmin(ADMIN_DISCOUNTS_PATH)
  const codes = await listDiscountCodes()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Discount codes</h1>
          <p className="text-sm text-muted-foreground">Customers apply one code per order at checkout.</p>
        </div>
        <Link href={`${ADMIN_DISCOUNTS_PATH}/new`} className={buttonVariants()}>
          <Plus data-icon="inline-start" />
          New code
        </Link>
      </div>

      {codes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <TicketPercent className="size-6" />
            </span>
            <p className="text-lg font-semibold">No discount codes yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">Create a code to offer money off or free shipping.</p>
          </CardContent>
        </Card>
      ) : (
        <DiscountCodeTable codes={codes} />
      )}
    </div>
  )
}
