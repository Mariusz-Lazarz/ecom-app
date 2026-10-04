import Link from "next/link"

import { MessageStatusBadge } from "@/components/admin/message-status-badge"
import { formatOrderDateTime } from "@/components/orders/format"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { adminMessageHref } from "@/lib/admin-messages"
import type { ContactMessage } from "@/lib/contact"
import { cn } from "@/lib/utils"
import { contactTopicLabel } from "@/lib/validation/contact"

/**
 * The admin message list as a table; each row links to the message (the whole row is the hit
 * area) and unread ones are bold. Scrolls sideways inside its container on small screens.
 */
export function AdminMessageTable({ messages }: { messages: ContactMessage[] }) {
  return (
    <div className="rounded-xl border bg-card">
      <Table aria-label="Messages" className="min-w-[52rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">From</TableHead>
            <TableHead>Topic</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="pr-4">Received</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {messages.map((message) => {
            const unread = message.status === "new"
            return (
              <TableRow key={message.id} data-status={message.status} className="relative">
                <TableCell className="max-w-56 pl-4 align-top">
                  <Link
                    href={adminMessageHref(message.id)}
                    className={cn(
                      "block truncate before:absolute before:inset-0 hover:underline focus-visible:outline-none focus-visible:before:ring-2 focus-visible:before:ring-ring focus-visible:before:ring-inset",
                      unread ? "font-semibold" : "font-medium",
                    )}
                  >
                    {message.name}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">{message.email}</span>
                </TableCell>
                <TableCell className="align-top">
                  <span className="block">{contactTopicLabel(message.topic)}</span>
                  {message.orderNumber && (
                    <span className="block text-xs text-muted-foreground">{message.orderNumber}</span>
                  )}
                </TableCell>
                <TableCell className="max-w-96 align-top whitespace-normal">
                  <p className={cn("line-clamp-2 text-sm", unread ? "text-foreground" : "text-muted-foreground")}>
                    {message.message}
                  </p>
                </TableCell>
                <TableCell className="align-top">
                  <MessageStatusBadge status={message.status} />
                </TableCell>
                <TableCell className="pr-4 align-top text-muted-foreground">
                  <time dateTime={message.createdAt.toISOString()}>{formatOrderDateTime(message.createdAt)}</time>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
