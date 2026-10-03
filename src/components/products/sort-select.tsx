"use client"

import Form from "next/form"
import { useRef } from "react"

import { SORT_OPTIONS, type CatalogueQuery } from "@/lib/catalogue"

type SortSelectProps = {
  basePath: string
  query: CatalogueQuery
}

/**
 * A GET form, so sorting works without JavaScript (via the submit button inside <noscript>).
 * With JavaScript it submits as soon as the selection changes. Changing the sort goes back to page 1.
 */
export function SortSelect({ basePath, query }: SortSelectProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const hidden: [string, string | undefined][] = [
    ["q", query.q],
    ["category", query.category],
    ["onSale", query.onSale ? "true" : undefined],
  ]

  return (
    <Form ref={formRef} action={basePath} className="flex items-center gap-2">
      {hidden.map(([name, value]) => value && <input key={name} type="hidden" name={name} value={value} />)}
      <label htmlFor="catalogue-sort" className="text-sm whitespace-nowrap text-muted-foreground">
        Sort by
      </label>
      <select
        key={query.sort}
        id="catalogue-sort"
        name="sort"
        defaultValue={query.sort}
        onChange={() => formRef.current?.requestSubmit()}
        className="h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="text-sm underline">
          Apply
        </button>
      </noscript>
    </Form>
  )
}
