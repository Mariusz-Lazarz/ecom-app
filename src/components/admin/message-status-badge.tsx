import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { CONTACT_MESSAGE_STATUS_LABELS, type ContactMessageStatus } from "@/lib/validation/contact"

const STYLES: Record<ContactMessageStatus, string> = {
  new: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300",
  read: "border-border bg-muted text-muted-foreground",
  archived: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
}

/** A contact message's status: New, Read or Archived. */
export function MessageStatusBadge({ status, className }: { status: ContactMessageStatus; className?: string }) {
  return (
    <Badge variant="outline" data-status={status} className={cn(STYLES[status], className)}>
      {CONTACT_MESSAGE_STATUS_LABELS[status]}
    </Badge>
  )
}
