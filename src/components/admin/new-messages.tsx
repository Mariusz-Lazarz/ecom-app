import Link from "next/link"

import { formatOrderDate } from "@/components/orders/format"
import { adminMessageHref } from "@/lib/admin-messages"
import type { ContactMessage } from "@/lib/contact"
import { contactTopicLabel } from "@/lib/validation/contact"

/** The dashboard's newest unread contact messages: sender, topic, a line of the text and the date. */
export function NewMessages({ messages }: { messages: ContactMessage[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">No unread messages. Nice work!</p>
  }
  return (
    <ul aria-label="New messages" className="divide-y">
      {messages.map((message) => (
        <li key={message.id} className="relative flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0 space-y-0.5">
            <Link
              href={adminMessageHref(message.id)}
              className="block truncate font-medium before:absolute before:inset-0 hover:underline"
            >
              {message.name} · {contactTopicLabel(message.topic)}
            </Link>
            <p className="truncate text-sm text-muted-foreground">{message.message}</p>
          </div>
          <time dateTime={message.createdAt.toISOString()} className="shrink-0 text-xs text-muted-foreground">
            {formatOrderDate(message.createdAt)}
          </time>
        </li>
      ))}
    </ul>
  )
}
