"use client"

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MAX_SPEC_LABEL_LENGTH, MAX_SPEC_VALUE_LENGTH, MAX_SPECS } from "@/lib/validation/admin-products"

export type SpecRow = { id: string; label: string; value: string }

type SpecsEditorProps = {
  specs: SpecRow[]
  onChange: (specs: SpecRow[]) => void
  invalid?: boolean
}

let nextId = 0
/** A new, empty row with a client-side id for React keys. */
export const newSpecRow = (label = "", value = ""): SpecRow => ({ id: `spec-${++nextId}`, label, value })

/** A copy of `list` with the item at `from` moved to `to`. */
export function moveItem<T>(list: T[], from: number, to: number) {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * The product's spec table as ordered label / value rows: add, edit, remove and move rows up or
 * down. Controlled; the form posts the rows as JSON.
 */
export function SpecsEditor({ specs, onChange, invalid }: SpecsEditorProps) {
  const update = (index: number, patch: Partial<SpecRow>) =>
    onChange(specs.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  return (
    <div className="space-y-3">
      {specs.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No specs yet. Add rows like “Weight · 250 g”.
        </p>
      ) : (
        <ol aria-label="Specs" className="space-y-2">
          {specs.map((row, index) => {
            const n = index + 1
            return (
              <li key={row.id} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]">
                <Input
                  aria-label={`Spec ${n} label`}
                  placeholder="Label"
                  value={row.label}
                  maxLength={MAX_SPEC_LABEL_LENGTH}
                  onChange={(event) => update(index, { label: event.target.value })}
                  aria-invalid={invalid && !row.label.trim() ? true : undefined}
                  className="col-span-1 h-9"
                />
                <Input
                  aria-label={`Spec ${n} value`}
                  placeholder="Value"
                  value={row.value}
                  maxLength={MAX_SPEC_VALUE_LENGTH}
                  onChange={(event) => update(index, { value: event.target.value })}
                  aria-invalid={invalid && !row.value.trim() ? true : undefined}
                  className="col-start-1 h-9 sm:col-start-auto"
                />
                <div className="col-start-2 row-span-2 row-start-1 flex items-start gap-0.5 sm:col-start-auto sm:row-span-1 sm:row-start-auto">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    aria-label={`Move spec ${n} up`}
                    disabled={index === 0}
                    onClick={() => onChange(moveItem(specs, index, index - 1))}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    aria-label={`Move spec ${n} down`}
                    disabled={index === specs.length - 1}
                    onClick={() => onChange(moveItem(specs, index, index + 1))}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    aria-label={`Remove spec ${n}`}
                    onClick={() => onChange(specs.filter((_, i) => i !== index))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            )
          })}
        </ol>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={specs.length >= MAX_SPECS}
        onClick={() => onChange([...specs, newSpecRow()])}
      >
        <Plus data-icon="inline-start" />
        Add spec
      </Button>
    </div>
  )
}
