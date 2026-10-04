import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Mail, UserRound } from "lucide-react"
import * as z from "zod"

import { MessageActions } from "@/components/admin/message-actions"
import { MessageStatusBadge } from "@/components/admin/message-status-badge"
import { formatOrderDateTime } from "@/components/orders/format"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { adminMessageHref, ADMIN_MESSAGES_PATH } from "@/lib/admin-messages"
import { adminOrdersHref } from "@/lib/admin-orders"
import { requireAdmin } from "@/lib/auth-guards"
import { getContactMessage } from "@/lib/contact"
import { contactTopicLabel } from "@/lib/validation/contact"

export const metadata: Metadata = { title: "Message — Admin — Northcart" }

/** The "Reply by email" link: the sender's address with a subject quoting the topic. */
function replyHref(email: string, topic: string) {
  return `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}?subject=${encodeURIComponent(`Re: ${topic}`)}`
}

/** One contact message: the sender, topic, order, text, and buttons to change its status or reply. */
export default async function AdminMessagePage({ params }: PageProps<"/admin/messages/[id]">) {
  const { id } = await params
  await requireAdmin(adminMessageHref(id))
  if (!z.uuid().safeParse(id).success) notFound()
  const message = await getContactMessage(id)
  if (!message) notFound()

  const topic = contactTopicLabel(message.topic)

  return (
    <div className="space-y-6">
      <Link href={ADMIN_MESSAGES_PATH} className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2" })}>
        <ArrowLeft data-icon="inline-start" />
        All messages
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">{topic}</h1>
            <MessageStatusBadge status={message.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            Received <time dateTime={message.createdAt.toISOString()}>{formatOrderDateTime(message.createdAt)}</time>
          </p>
        </div>
        <a href={replyHref(message.email, topic)} className={buttonVariants()}>
          <Mail data-icon="inline-start" />
          Reply by email
        </a>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Message</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-base leading-7 break-words whitespace-pre-wrap">{message.message}</p>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">From</CardTitle>
              <CardDescription>{message.userId ? "Signed in when sending" : "Sent as a guest"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <UserRound aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="font-medium">{message.name}</p>
                  <a href={`mailto:${message.email}`} className="block truncate text-muted-foreground hover:underline">
                    {message.email}
                  </a>
                </div>
              </div>
              {message.userId && (
                <Link href={adminOrdersHref({ q: message.email })} className="inline-block font-medium underline-offset-4 hover:underline">
                  Their orders
                </Link>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Order</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {!message.orderNumber ? (
                <p className="text-muted-foreground">None given.</p>
              ) : message.orderExists ? (
                <Link href={`/admin/orders/${message.orderNumber}`} className="font-medium underline-offset-4 hover:underline">
                  {message.orderNumber}
                </Link>
              ) : (
                <p>
                  {message.orderNumber} <span className="text-muted-foreground">(no such order)</span>
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <MessageActions id={message.id} status={message.status} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
