import { Ban, CircleCheck, CircleX, Clock, PackageCheck, Truck } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { formatOrderDateTime } from "@/components/orders/format"
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/order-rules"
import type { ActorRole, OrderEvent } from "@/lib/orders"
import { cn } from "@/lib/utils"

const ICONS: Record<OrderStatus, LucideIcon> = {
  pending: Clock,
  processing: PackageCheck,
  shipped: Truck,
  delivered: CircleCheck,
  cancelled: Ban,
  rejected: CircleX,
}

const DEFAULT_NOTES: Partial<Record<OrderStatus, string>> = {
  pending: "Order placed and paid.",
}

const ACTOR_LABELS: Record<ActorRole, string> = {
  customer: "Customer",
  admin: "Admin",
  system: "System",
}

type OrderTimelineProps = {
  // Oldest first, as `getOrderForUser` / `getOrder` return them.
  events: Pick<OrderEvent, "id" | "status" | "actorRole" | "note" | "createdAt">[]
  trackingNumber: string | null
  // Admin view: say who made each change ("by Admin") next to its time.
  showActor?: boolean
}

/**
 * The order's status history, oldest first; the latest step is highlighted. Shared by customer and
 * admin views; the admin view adds who made each change.
 */
export function OrderTimeline({ events, trackingNumber, showActor = false }: OrderTimelineProps) {
  return (
    <ol aria-label="Order history" className="space-y-0">
      {events.map((event, index) => {
        const Icon = ICONS[event.status]
        const latest = index === events.length - 1
        const note = event.note ?? DEFAULT_NOTES[event.status]
        return (
          <li key={event.id} className="relative flex gap-3 pb-6 last:pb-0" data-status={event.status}>
            {!latest && <span aria-hidden className="absolute top-8 bottom-0 left-4 w-px -translate-x-1/2 bg-border" />}
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full border",
                latest ? "border-primary bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-sm font-medium">{ORDER_STATUS_LABELS[event.status]}</p>
              <p className="text-xs text-muted-foreground">
                <time dateTime={event.createdAt.toISOString()}>{formatOrderDateTime(event.createdAt)}</time>
                {showActor && <> · by {ACTOR_LABELS[event.actorRole]}</>}
              </p>
              {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
              {event.status === "shipped" && trackingNumber && (
                <p className="mt-1 text-sm">
                  Tracking number: <span className="font-mono font-medium">{trackingNumber}</span>
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
