"use client"

import Form from "next/form"
import { usePathname, useSearchParams } from "next/navigation"
import { useId, useState } from "react"
import { Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * The header's search button. It opens a search bar under the header that submits a plain GET to
 * /products?q=…, so results are a normal catalogue URL. On /products the current category, sort and
 * sale filter are kept, so a search narrows what's already shown.
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

// Rendered only once opened, so reading the URL never runs during the server render.
function SearchPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const onCatalogue = pathname === "/products"
  const carried = onCatalogue
    ? CARRIED_FILTERS.flatMap((name) => {
        const value = searchParams.get(name)
        return value ? [[name, value] as const] : []
      })
    : []

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
        <label htmlFor={`${id}-q`} className="sr-only">
          Search products
        </label>
        <Input
          id={`${id}-q`}
          name="q"
          type="search"
          placeholder="Search products…"
          defaultValue={onCatalogue ? (searchParams.get("q") ?? "") : ""}
          autoFocus
          maxLength={100}
          className="h-10"
        />
        <Button type="submit" size="lg" className="h-10 px-4">
          Go
        </Button>
        <Button type="button" variant="ghost" size="icon-lg" aria-label="Close search" onClick={onClose}>
          <X />
        </Button>
      </Form>
    </div>
  )
}
