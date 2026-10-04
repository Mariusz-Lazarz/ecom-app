import { formatOrderDate } from "@/components/orders/format"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Subscriber } from "@/lib/newsletter"
import { cn } from "@/lib/utils"

const SOURCE_LABELS: Record<string, string> = { home: "Home page", register: "Registration" }

/** The newsletter subscriber list: email, status, where they signed up, and when. */
export function SubscriberTable({ subscribers }: { subscribers: Subscriber[] }) {
  return (
    <div className="rounded-xl border bg-card">
      <Table aria-label="Subscribers" className="min-w-[40rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Email</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Signed up</TableHead>
            <TableHead className="pr-4">Last change</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subscribers.map((subscriber) => (
            <TableRow key={subscriber.id} data-status={subscriber.status}>
              <TableCell className="max-w-80 truncate pl-4 font-medium">{subscriber.email}</TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={cn(
                    subscriber.status === "subscribed"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {subscriber.status === "subscribed" ? "Subscribed" : "Unsubscribed"}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{SOURCE_LABELS[subscriber.source] ?? subscriber.source}</TableCell>
              <TableCell className="text-muted-foreground">
                <time dateTime={subscriber.createdAt.toISOString()}>{formatOrderDate(subscriber.createdAt)}</time>
              </TableCell>
              <TableCell className="pr-4 text-muted-foreground">
                <time dateTime={subscriber.updatedAt.toISOString()}>{formatOrderDate(subscriber.updatedAt)}</time>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
