"use client"

import Form from "next/form"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"
import { ArrowRight, ImageOff, Loader2, Search, X } from "lucide-react"

import { Price } from "@/components/products/price"
import { Button } from "@/components/ui/button"
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox"
import type { ProductSummary } from "@/lib/products"

/**
 * The header's search button. It opens a search bar under the header. From two characters on, it
 * suggests up to six matching products as you type (arrow keys move through them, Enter or a click
 * opens one). Submitting the form, with Enter while no suggestion is highlighted or with Go, is a
 * plain GET to /products?q=…, so full results are a normal catalogue URL. On /products the current
 * category, sort and sale filter are kept, so a search narrows what's already shown.
 */
export function HeaderSearch() {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Search"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Search />
      </Button>
      {open && <SearchPanel id={panelId} onClose={() => setOpen(false)} />}
    </>
  )
}

const CARRIED_FILTERS = ["category", "sort", "onSale"] as const

export const MIN_SUGGEST_LENGTH = 2
export const SUGGEST_DEBOUNCE_MS = 250
export const SUGGEST_LIMIT = 6

type Suggestion = Pick<
  ProductSummary,
  "id" | "slug" | "name" | "brand" | "priceCents" | "compareAtCents" | "onSale" | "currency" | "category" | "image"
>

type SuggestionResponse = { query: string; items: Suggestion[]; failed: boolean }

/**
 * Products matching `term`, fetched from /api/products after the user pauses typing. Each new term
 * aborts the request for the previous one, and a response is only kept if it belongs to the term it
 * was fetched for, so a slow answer to an older term can never replace a newer one.
 */
function useProductSuggestions(term: string) {
  const query = term.trim()
  const enabled = query.length >= MIN_SUGGEST_LENGTH
  const [response, setResponse] = useState<SuggestionResponse | null>(null)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, pageSize: String(SUGGEST_LIMIT) })
        const res = await fetch(`/api/products?${params}`, { signal: controller.signal })
        if (!res.ok) throw new Error(`Search failed with ${res.status}`)
        const body = (await res.json()) as { items: Suggestion[] }
        if (!controller.signal.aborted) setResponse({ query, items: body.items, failed: false })
      } catch {
        if (!controller.signal.aborted) setResponse({ query, items: [], failed: true })
      }
    }, SUGGEST_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [enabled, query])

  const current = enabled && response?.query === query ? response : null
  return {
    query,
    enabled,
    loading: enabled && current === null,
    failed: current?.failed ?? false,
    // While the next term loads, the last results stay up so the list doesn't flicker per keystroke.
    items: enabled ? (current?.items ?? response?.items ?? []) : [],
  }
}

// Rendered only once opened, so reading the URL never runs during the server render.
function SearchPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const onCatalogue = pathname === "/products"
  const carried: [string, string][] = onCatalogue
    ? CARRIED_FILTERS.flatMap((name) => {
        const value = searchParams.get(name)
        return value ? [[name, value] as [string, string]] : []
      })
    : []

  const [term, setTerm] = useState(() => (onCatalogue ? (searchParams.get("q") ?? "") : ""))
  const [listOpen, setListOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const suggestions = useProductSuggestions(term)
  const allResultsHref = `/products?${new URLSearchParams([...carried, ["q", suggestions.query]])}`

  return (
    <div id={id} className="absolute inset-x-0 top-full border-b bg-background shadow-sm">
      {/* Closing on submit hides the panel as the search navigates; the results page shows the term. */}
      <Form
        action="/products"
        role="search"
        onSubmit={onClose}
        onKeyDown={(event) => event.key === "Escape" && onClose()}
        className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3 sm:px-6"
      >
        {carried.map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <Combobox<Suggestion>
          items={suggestions.items}
          // The API has already filtered; the list shows exactly what it returned.
          filter={null}
          itemToStringLabel={(product) => product.name}
          inputValue={term}
          onInputValueChange={(value, details) => {
            // The input holds a free-text search, not a selection, so only typing changes it. The
            // combobox would otherwise reset it to the chosen item's label (or empty) when it closes.
            if (details.reason !== "input-change") return
            setTerm(value)
            setListOpen(true)
          }}
          open={listOpen && suggestions.enabled}
          onOpenChange={(next, details) => {
            if (!next && details.reason === "escape-key") onClose()
            setListOpen(next)
          }}
        >
          {/* The suggestions span this whole row, so they get the full width on phones. */}
          <div ref={anchorRef} className="flex min-w-0 flex-1 items-center gap-2">
            <label htmlFor={`${id}-q`} className="sr-only">
              Search products
            </label>
            <ComboboxInput
              id={`${id}-q`}
              name="q"
              placeholder="Search products…"
              autoFocus
              autoComplete="off"
              maxLength={100}
              showTrigger={false}
              className="h-10 min-w-0 flex-1"
            >
              {suggestions.loading && (
                <Loader2 aria-hidden className="mr-3 size-4 shrink-0 animate-spin text-muted-foreground" />
              )}
            </ComboboxInput>
            <Button type="submit" size="lg" className="h-10 px-4">
              Go
            </Button>
            <Button type="button" variant="ghost" size="icon-lg" aria-label="Close search" onClick={onClose}>
              <X />
            </Button>
          </div>
          <ComboboxContent anchor={anchorRef} className="min-w-(--anchor-width)">
            <ComboboxList aria-label="Suggested products" className="max-h-[min(24rem,var(--available-height))]">
              {(product: Suggestion) => (
                <ComboboxItem
                  key={product.id}
                  value={product}
                  // Not prefetched: the list changes with every keystroke.
                  render={<Link href={`/products/${product.slug}`} prefetch={false} onClick={onClose} />}
                  className="cursor-pointer gap-3 py-1.5 pr-2"
                >
                  <SuggestionRow product={product} />
                </ComboboxItem>
              )}
            </ComboboxList>
            <SuggestionStatus {...suggestions} />
            <Link
              href={allResultsHref}
              onClick={onClose}
              className="flex items-center justify-between gap-2 border-t px-3 py-2.5 text-sm font-medium hover:bg-muted"
            >
              <span className="truncate">See all results for “{suggestions.query}”</span>
              <ArrowRight className="size-4 shrink-0" />
            </Link>
          </ComboboxContent>
        </Combobox>
      </Form>
    </div>
  )
}

function SuggestionRow({ product }: { product: Suggestion }) {
  return (
    <>
      <span className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted">
        {product.image ? (
          <Image src={product.image.url} alt="" fill sizes="48px" className="object-cover" />
        ) : (
          <ImageOff aria-hidden className="absolute inset-0 m-auto size-4 text-muted-foreground" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{product.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {product.brand} · {product.category.name}
        </span>
      </span>
      <Price
        size="sm"
        priceCents={product.priceCents}
        compareAtCents={product.onSale ? product.compareAtCents : null}
        currency={product.currency}
        className="shrink-0 flex-col items-end"
      />
    </>
  )
}

function SuggestionStatus({
  query,
  loading,
  failed,
  items,
}: {
  query: string
  loading: boolean
  failed: boolean
  items: Suggestion[]
}) {
  let message: string | null = null
  if (failed) message = "Couldn't load suggestions. Press Enter to search anyway."
  else if (loading && items.length === 0) message = "Searching…"
  else if (!loading && items.length === 0) message = `No products match “${query}”.`

  return (
    <p role="status" className={message ? "px-3 py-3 text-sm text-muted-foreground" : "sr-only"}>
      {message ?? `${items.length} ${items.length === 1 ? "suggestion" : "suggestions"}`}
    </p>
  )
}
