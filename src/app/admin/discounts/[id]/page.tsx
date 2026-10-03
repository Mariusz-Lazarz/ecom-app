import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache } from "react"
import { ArrowLeft } from "lucide-react"
import * as z from "zod"

import { DeleteDiscountButton } from "@/components/admin/delete-discount-button"
import { DiscountCodeForm } from "@/components/admin/discount-code-form"
import { buttonVariants } from "@/components/ui/button"
import { requireAdmin } from "@/lib/auth-guards"
import { getDiscountCode } from "@/lib/discounts"
import { ADMIN_DISCOUNTS_PATH } from "@/lib/validation/discounts"

const CodeId = z.uuid()

// generateMetadata and the page both need the code; cache() makes that one query per request.
// Anything that isn't a UUID can't be a code id, so it never reaches the database.
const loadCode = cache(async (id: string) => (CodeId.safeParse(id).success ? getDiscountCode(id) : null))

const editHref = (id: string) => `${ADMIN_DISCOUNTS_PATH}/${encodeURIComponent(id)}`

export async function generateMetadata({ params }: PageProps<"/admin/discounts/[id]">): Promise<Metadata> {
  const { id } = await params
  await requireAdmin(editHref(id))
  const code = await loadCode(id)
  return { title: `${code ? code.code : "Discount code not found"} — Admin — Northcart` }
}

/** The discount code form for an existing code, with how often it was used and a delete button. */
export default async function EditDiscountCodePage({ params }: PageProps<"/admin/discounts/[id]">) {
  const { id } = await params
  await requireAdmin(editHref(id))
  const code = await loadCode(id)
  if (!code) notFound()

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href={ADMIN_DISCOUNTS_PATH} className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2" })}>
          <ArrowLeft data-icon="inline-start" />
          Discount codes
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="font-mono text-3xl font-semibold tracking-tight break-words">{code.code}</h1>
            <p className="text-sm text-muted-foreground">
              Used {code.redemptionCount} {code.redemptionCount === 1 ? "time" : "times"}
              {code.maxRedemptions !== null && ` of ${code.maxRedemptions}`}
            </p>
          </div>
          <DeleteDiscountButton id={code.id} code={code.code} redemptionCount={code.redemptionCount} />
        </div>
      </div>
      <DiscountCodeForm discount={code} />
    </div>
  )
}
