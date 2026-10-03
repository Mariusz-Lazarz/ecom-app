import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { DiscountCodeForm } from "@/components/admin/discount-code-form"
import { buttonVariants } from "@/components/ui/button"
import { requireAdmin } from "@/lib/auth-guards"
import { ADMIN_DISCOUNTS_PATH } from "@/lib/validation/discounts"

export const metadata: Metadata = { title: "New discount code — Admin — Northcart" }

/** The discount code form, empty. */
export default async function NewDiscountCodePage() {
  await requireAdmin(`${ADMIN_DISCOUNTS_PATH}/new`)

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href={ADMIN_DISCOUNTS_PATH} className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2" })}>
          <ArrowLeft data-icon="inline-start" />
          Discount codes
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">New discount code</h1>
      </div>
      <DiscountCodeForm discount={null} />
    </div>
  )
}
