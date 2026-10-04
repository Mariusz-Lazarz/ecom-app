import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from "lucide-react"

import { describeDelta, formatDelta, type Delta } from "@/lib/admin-analytics"
import { cn } from "@/lib/utils"

const STYLES: Record<Delta["direction"], string> = {
  up: "text-emerald-700 dark:text-emerald-400",
  down: "text-red-700 dark:text-red-400",
  flat: "text-muted-foreground",
  new: "text-emerald-700 dark:text-emerald-400",
}

const ICONS = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus, new: Sparkles }

/**
 * A change against the previous period: an arrow, the signed percentage and its colour (green up,
 * red down), with the direction also spelled out for screen readers, so it never relies on colour.
 */
export function DeltaText({ delta, className }: { delta: Delta; className?: string }) {
  const Icon = ICONS[delta.direction]
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium tabular-nums", STYLES[delta.direction], className)}>
      <Icon aria-hidden className="size-4" />
      <span aria-hidden>{formatDelta(delta)}</span>
      <span className="sr-only">{describeDelta(delta)}</span>
    </span>
  )
}
