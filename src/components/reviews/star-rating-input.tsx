"use client"

import { useRef, useState, type KeyboardEvent } from "react"
import { Star } from "lucide-react"

import { cn } from "@/lib/utils"

export const STAR_LABELS = ["Poor", "Fair", "Good", "Very good", "Excellent"] as const

type StarRatingInputProps = {
  // Posted as this form field (a hidden input); empty until a star is picked.
  name: string
  defaultValue?: number
  // The id of the element that names the group.
  labelledBy: string
  invalid?: boolean
  describedBy?: string
  onChange?: (value: number) => void
}

/**
 * A 1–5 star picker that works like a radio group: Tab moves into it (onto the picked star, or
 * the first), arrow keys move and pick, Home/End jump to 1 or 5 stars, and the digits 1–5 pick
 * directly. Hovering previews a rating.
 */
export function StarRatingInput({ name, defaultValue, labelledBy, invalid, describedBy, onChange }: StarRatingInputProps) {
  const [value, setValue] = useState(defaultValue && defaultValue >= 1 && defaultValue <= 5 ? defaultValue : 0)
  const [hover, setHover] = useState(0)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  const choose = (next: number, focus = false) => {
    setValue(next)
    onChange?.(next)
    if (focus) buttons.current[next - 1]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = value || 0
    let next: number | null = null
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = Math.min(5, current + 1)
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = Math.max(1, current - 1)
    else if (event.key === "Home") next = 1
    else if (event.key === "End") next = 5
    else if (/^[1-5]$/.test(event.key)) next = Number(event.key)
    if (next === null) return
    event.preventDefault()
    choose(next, true)
  }

  const shown = hover || value

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        role="radiogroup"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHover(0)}
        className="flex items-center gap-0.5"
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const checked = value === star
          return (
            <button
              key={star}
              ref={(el) => {
                buttons.current[star - 1] = el
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${star} ${star === 1 ? "star" : "stars"}, ${STAR_LABELS[star - 1]}`}
              // Roving tab stop: only the picked star (or the first, before a pick) is tabbable.
              tabIndex={checked || (value === 0 && star === 1) ? 0 : -1}
              onClick={() => choose(star)}
              onMouseEnter={() => setHover(star)}
              className="rounded-md p-1 outline-none transition-transform hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Star
                aria-hidden
                className={cn(
                  "size-7 transition-colors",
                  star <= shown ? "fill-amber-400 text-amber-400" : "text-muted-foreground/50",
                  invalid && shown === 0 && "text-destructive/60",
                )}
              />
            </button>
          )
        })}
      </div>
      <span aria-hidden className="min-w-20 text-sm text-muted-foreground">
        {shown ? STAR_LABELS[shown - 1] : "Select a rating"}
      </span>
      <input type="hidden" name={name} value={value || ""} />
    </div>
  )
}
