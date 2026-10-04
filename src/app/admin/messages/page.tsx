import type { Metadata } from "next"
import Link from "next/link"
import { Inbox } from "lucide-react"

import { AdminMessageTable } from "@/components/admin/admin-message-table"
import { ListFilters } from "@/components/admin/list-filters"
import { PaginationNav } from "@/components/pagination-nav"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ADMIN_MESSAGES_PATH, adminMessagesHref, parseAdminMessageQuery } from "@/lib/admin-messages"
import { requireAdmin } from "@/lib/auth-guards"
import { getContactMessageCounts, listContactMessages } from "@/lib/contact"
import {
  CONTACT_MESSAGE_STATUSES,
  CONTACT_MESSAGE_STATUS_LABELS,
  DEFAULT_ADMIN_MESSAGES_PAGE_SIZE,
} from "@/lib/validation/contact"

export const metadata: Metadata = { title: "Messages — Admin — Northcart" }

/**
 * Contact form messages, newest first, filtered by `?status=`, searched by `?q=` (name, email,
 * order number or text), paginated with `?page=`. Invalid params fall back to their defaults.
 */
export default async function AdminMessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  await requireAdmin(ADMIN_MESSAGES_PATH)
  const query = parseAdminMessageQuery(await searchParams)
  const [list, counts] = await Promise.all([listContactMessages(query), getContactMessageCounts()])

  const filtered = Boolean(query.status || query.q)
  const chips = [
    { label: "All", count: counts.new + counts.read + counts.archived, status: undefined },
    ...CONTACT_MESSAGE_STATUSES.map((status) => ({ label: CONTACT_MESSAGE_STATUS_LABELS[status], count: counts[status], status })),
  ].map(({ label, count, status }) => ({
    label,
    count,
    href: adminMessagesHref({ ...query, status, page: 1 }),
    active: query.status === status,
  }))

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Messages</h1>

      <ListFilters
        chips={chips}
        search={{
          action: ADMIN_MESSAGES_PATH,
          hidden: {
            status: query.status,
            pageSize: query.pageSize !== DEFAULT_ADMIN_MESSAGES_PAGE_SIZE ? String(query.pageSize) : undefined,
          },
          q: query.q,
          placeholder: "Name, email, order or text",
          clearHref: adminMessagesHref({ ...query, q: undefined, page: 1 }),
        }}
      />

      {list.items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Inbox className="size-6" />
            </span>
            <p className="text-lg font-semibold">{list.total === 0 ? "No messages" : "Nothing on this page"}</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              {list.total > 0
                ? `There ${list.pageCount === 1 ? "is only 1 page" : `are only ${list.pageCount} pages`} of messages.`
                : filtered
                  ? "No messages match these filters."
                  : "When customers use the contact form, their messages show up here."}
            </p>
            {(filtered || list.total > 0) && (
              <Link
                href={list.total > 0 ? adminMessagesHref({ ...query, page: 1 }) : adminMessagesHref()}
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
            {list.total} {list.total === 1 ? "message" : "messages"}
            {query.status ? ` · ${CONTACT_MESSAGE_STATUS_LABELS[query.status].toLowerCase()}` : ""}
            {query.q ? ` matching “${query.q}”` : ""}
          </p>
          <AdminMessageTable messages={list.items} />
        </div>
      )}

      <PaginationNav page={query.page} pageCount={list.pageCount} href={(page) => adminMessagesHref({ ...query, page })} />
    </div>
  )
}
