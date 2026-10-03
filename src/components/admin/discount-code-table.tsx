import Link from "next/link"

import { DiscountActiveSwitch } from "@/components/admin/discount-active-switch"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatPrice } from "@/lib/catalogue"
import type { DiscountCode } from "@/lib/discounts"
import { describeDiscount } from "@/lib/order-rules"
import { ADMIN_DISCOUNTS_PATH } from "@/lib/validation/discounts"

export type DiscountCodeStatus = "active" | "inactive" | "scheduled" | "expired" | "used-up"

const DAY_MS = 24 * 60 * 60 * 1000

/** Where a code stands right now, for its badge: switched off, not started, ended, out of uses, or live. */
export function discountCodeStatus(
  code: Pick<DiscountCode, "active" | "startsAt" | "endsAt" | "maxRedemptions" | "redemptionCount">,
  now = new Date(),
): DiscountCodeStatus {
  if (!code.active) return "inactive"
  if (code.endsAt && now >= code.endsAt) return "expired"
  if (code.startsAt && now < code.startsAt) return "scheduled"
  if (code.maxRedemptions !== null && code.redemptionCount >= code.maxRedemptions) return "used-up"
  return "active"
}

const STATUS_BADGES: Record<DiscountCodeStatus, { label: string; className?: string; variant: "outline" | "secondary" }> = {
  active: {
    label: "Active",
    variant: "outline",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  inactive: { label: "Inactive", variant: "secondary" },
  scheduled: {
    label: "Scheduled",
    variant: "outline",
    className: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  expired: { label: "Expired", variant: "secondary" },
  "used-up": {
    label: "Used up",
    variant: "outline",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
}

const formatDay = (date: Date) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(date)

/** The days a code works, as entered in the form (UTC; `endsAt` is exclusive, so the last day is the one before). */
export function formatValidity({ startsAt, endsAt }: Pick<DiscountCode, "startsAt" | "endsAt">) {
  const end = endsAt ? formatDay(new Date(endsAt.getTime() - DAY_MS)) : null
  if (startsAt && end) return `${formatDay(startsAt)} – ${end}`
  if (startsAt) return `From ${formatDay(startsAt)}`
  if (end) return `Until ${end}`
  return "No end date"
}

/**
 * The admin discount code list as a table (it scrolls sideways on small screens). The code links
 * to its edit page; the switch turns it on or off in place.
 */
export function DiscountCodeTable({ codes, now = new Date() }: { codes: DiscountCode[]; now?: Date }) {
  return (
    <div className="rounded-xl border bg-card">
      <Table aria-label="Discount codes" className="min-w-[52rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Code</TableHead>
            <TableHead>Discount</TableHead>
            <TableHead className="text-right">Used</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="pr-4 text-right">Active</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {codes.map((code) => {
            const status = STATUS_BADGES[discountCodeStatus(code, now)]
            return (
              <TableRow key={code.id} className="relative">
                <TableCell className="max-w-64 pl-4">
                  <Link
                    href={`${ADMIN_DISCOUNTS_PATH}/${code.id}`}
                    className="block font-mono font-semibold tracking-wide before:absolute before:inset-0 hover:underline focus-visible:outline-none focus-visible:before:ring-2 focus-visible:before:ring-ring focus-visible:before:ring-inset"
                  >
                    {code.code}
                  </Link>
                  {code.description && (
                    <span className="block truncate text-xs text-muted-foreground">{code.description}</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="block font-medium">{describeDiscount(code)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {code.minSubtotalCents > 0 ? `Orders over ${formatPrice(code.minSubtotalCents)}` : "Any order"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="block tabular-nums">
                    {code.redemptionCount} / {code.maxRedemptions ?? "∞"}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {code.perUserLimit === null ? "No limit per customer" : `${code.perUserLimit} per customer`}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{formatValidity(code)}</TableCell>
                <TableCell>
                  <Badge variant={status.variant} className={status.className}>
                    {status.label}
                  </Badge>
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <DiscountActiveSwitch id={code.id} code={code.code} active={code.active} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
