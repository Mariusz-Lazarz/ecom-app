import type { Metadata } from "next"
import Link from "next/link"
import { Download, MailX, UserCheck, UserMinus } from "lucide-react"

import { ListFilters } from "@/components/admin/list-filters"
import { SubscriberTable } from "@/components/admin/subscriber-table"
import { PaginationNav } from "@/components/pagination-nav"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import {
  ADMIN_NEWSLETTER_PATH,
  adminSubscribersHref,
  NEWSLETTER_EXPORT_PATH,
  parseAdminSubscriberQuery,
} from "@/lib/admin-messages"
import { requireAdmin } from "@/lib/auth-guards"
import { getSubscriberCounts, listSubscribers } from "@/lib/newsletter"
import { DEFAULT_ADMIN_SUBSCRIBERS_PAGE_SIZE } from "@/lib/validation/newsletter"

export const metadata: Metadata = { title: "Newsletter — Admin — Northcart" }

/**
 * Newsletter subscribers, newest first, with counts, a `?status=` filter, a `?q=` email search and
 * a CSV download of every subscribed address.
 */
export default async function AdminNewsletterPage({ searchParams }: PageProps<"/admin/newsletter">) {
  await requireAdmin(ADMIN_NEWSLETTER_PATH)
  const query = parseAdminSubscriberQuery(await searchParams)
  const [list, counts] = await Promise.all([listSubscribers(query), getSubscriberCounts()])
  const filtered = Boolean(query.status || query.q)

  const chips = (
    [
      { label: "All", count: counts.subscribed + counts.unsubscribed, status: undefined },
      { label: "Subscribed", count: counts.subscribed, status: "subscribed" },
      { label: "Unsubscribed", count: counts.unsubscribed, status: "unsubscribed" },
    ] as const
  ).map(({ label, count, status }) => ({
    label,
    count,
    href: adminSubscribersHref({ ...query, status, page: 1 }),
    active: query.status === status,
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Newsletter</h1>
        {/* A plain link: the Route Handler answers with a CSV attachment. */}
        <a
          href={NEWSLETTER_EXPORT_PATH}
          download
          aria-disabled={counts.subscribed === 0 ? true : undefined}
          className={buttonVariants({ variant: "outline", className: counts.subscribed === 0 ? "pointer-events-none opacity-50" : "" })}
        >
          <Download data-icon="inline-start" />
          Export subscribed (CSV)
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <UserCheck aria-hidden className="size-4" /> Subscribed
            </CardDescription>
            <p className="text-3xl font-semibold tracking-tight tabular-nums" data-testid="count-subscribed">{counts.subscribed}</p>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <UserMinus aria-hidden className="size-4" /> Unsubscribed
            </CardDescription>
            <p className="text-3xl font-semibold tracking-tight tabular-nums" data-testid="count-unsubscribed">{counts.unsubscribed}</p>
          </CardHeader>
        </Card>
      </div>

      <ListFilters
        chips={chips}
        search={{
          action: ADMIN_NEWSLETTER_PATH,
          hidden: {
            status: query.status,
            pageSize: query.pageSize !== DEFAULT_ADMIN_SUBSCRIBERS_PAGE_SIZE ? String(query.pageSize) : undefined,
          },
          q: query.q,
          placeholder: "Search by email",
          clearHref: adminSubscribersHref({ ...query, q: undefined, page: 1 }),
        }}
      />

      {list.items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <MailX className="size-6" />
            </span>
            <p className="text-lg font-semibold">{list.total === 0 ? "No subscribers" : "Nothing on this page"}</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              {list.total > 0
                ? `There ${list.pageCount === 1 ? "is only 1 page" : `are only ${list.pageCount} pages`} of subscribers.`
                : filtered
                  ? "No subscribers match these filters."
                  : "Sign-ups from the home page and registration show up here."}
            </p>
            {(filtered || list.total > 0) && (
              <Link
                href={list.total > 0 ? adminSubscribersHref({ ...query, page: 1 }) : adminSubscribersHref()}
                className={buttonVariants({ variant: "outline", className: "mt-2" })}
              >
                {list.total > 0 ? "Go to the first page" : "Clear filters"}
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {list.total} {list.total === 1 ? "address" : "addresses"}
            {query.status ? ` · ${query.status}` : ""}
            {query.q ? ` matching “${query.q}”` : ""}
          </p>
          <SubscriberTable subscribers={list.items} />
        </div>
      )}

      <PaginationNav page={query.page} pageCount={list.pageCount} href={(page) => adminSubscribersHref({ ...query, page })} />
    </div>
  )
}
