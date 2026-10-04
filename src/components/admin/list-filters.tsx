import Form from "next/form"
import Link from "next/link"
import { Search, X } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { cn } from "@/lib/utils"

type ListFiltersProps = {
  // One chip per status (plus "All"), each a link keeping the search.
  chips: { label: string; count: number; href: string; active: boolean }[]
  search: {
    action: string
    // Params the search keeps (e.g. the status), as hidden inputs.
    hidden: Record<string, string | undefined>
    q?: string
    placeholder: string
    // Where "Clear" goes: the same list without the search.
    clearHref: string
  }
}

/**
 * Status chips with counts and a GET search box, for the simpler admin lists (messages,
 * newsletter). Chips keep the search; the search keeps the status; both go back to page 1.
 */
export function ListFilters({ chips, search }: ListFiltersProps) {
  return (
    <div className="space-y-4">
      <nav aria-label="Filter by status" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
          {chips.map(({ label, count, href, active }) => (
            <li key={label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(buttonVariants({ variant: active ? "default" : "outline", size: "sm" }), "rounded-full")}
              >
                {label}
                <span
                  className={cn(
                    "ml-0.5 rounded-full px-1.5 text-xs tabular-nums",
                    active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Form action={search.action} role="search" aria-label={search.placeholder} className="flex gap-2 sm:max-w-md">
        {Object.entries(search.hidden).map(([name, value]) =>
          value ? <input key={name} type="hidden" name={name} value={value} /> : null,
        )}
        <InputGroup className="h-9">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            // Remount on navigation so the box shows the current search.
            key={search.q ?? ""}
            type="search"
            name="q"
            defaultValue={search.q ?? ""}
            maxLength={100}
            placeholder={search.placeholder}
            aria-label={search.placeholder}
          />
        </InputGroup>
        <Button type="submit" className="h-9">
          Search
        </Button>
        {search.q && (
          <Link href={search.clearHref} className={buttonVariants({ variant: "ghost", className: "h-9" })}>
            <X data-icon="inline-start" />
            Clear
          </Link>
        )}
      </Form>
    </div>
  )
}
