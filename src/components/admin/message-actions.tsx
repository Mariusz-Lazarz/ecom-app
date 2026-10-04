"use client"

import { useState, useTransition } from "react"
import { Archive, ArchiveRestore, Mail, MailOpen } from "lucide-react"

import { setContactMessageStatus } from "@/app/actions/contact"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { GENERIC_MESSAGE } from "@/lib/errors"
import { notify } from "@/lib/notify"
import type { ContactMessageStatus } from "@/lib/validation/contact"

/**
 * Status buttons for one message: mark read / unread, and archive / move back to the inbox. The
 * Server Action refreshes the page (and the nav's unread badge); failures show as a toast.
 */
export function MessageActions({ id, status }: { id: string; status: ContactMessageStatus }) {
  const [pending, startTransition] = useTransition()
  const [target, setTarget] = useState<ContactMessageStatus | null>(null)
  const spinning = (next: ContactMessageStatus) => pending && target === next

  const change = (next: ContactMessageStatus) => {
    setTarget(next)
    startTransition(async () => {
      try {
        const result = await setContactMessageStatus(id, next)
        if (result.ok) notify.success(result.message)
        else notify.error("Couldn't update the message", { description: result.message })
      } catch {
        notify.error("Couldn't update the message", { description: GENERIC_MESSAGE })
      }
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "new" && (
        <Button variant="outline" disabled={pending} onClick={() => change("read")}>
          {spinning("read") ? <Spinner data-icon="inline-start" aria-hidden /> : <MailOpen data-icon="inline-start" />}
          Mark as read
        </Button>
      )}
      {status === "read" && (
        <Button variant="outline" disabled={pending} onClick={() => change("new")}>
          {spinning("new") ? <Spinner data-icon="inline-start" aria-hidden /> : <Mail data-icon="inline-start" />}
          Mark as unread
        </Button>
      )}
      {status === "archived" ? (
        <Button variant="outline" disabled={pending} onClick={() => change("read")}>
          {spinning("read") ? <Spinner data-icon="inline-start" aria-hidden /> : <ArchiveRestore data-icon="inline-start" />}
          Move to inbox
        </Button>
      ) : (
        <Button variant="outline" disabled={pending} onClick={() => change("archived")}>
          {spinning("archived") ? <Spinner data-icon="inline-start" aria-hidden /> : <Archive data-icon="inline-start" />}
          Archive
        </Button>
      )}
    </div>
  )
}
