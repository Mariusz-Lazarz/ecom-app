import { existsSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { parseCatalogueQuery } from "@/lib/catalogue"
import { categories, navLinks } from "@/lib/data"

const unique = <T,>(values: T[]) => new Set(values).size === values.length
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

describe("site data", () => {
  it("uses unique, URL-safe slugs for the footer categories", () => {
    const slugs = categories.map((c) => c.slug)
    expect(unique(slugs)).toBe(true)
    for (const slug of slugs) expect(slug).toMatch(slugPattern)
  })

  it("uses unique internal routes for navigation", () => {
    const hrefs = navLinks.map((link) => link.href)
    expect(unique(hrefs)).toBe(true)
    for (const href of hrefs) expect(href).toMatch(/^\/[a-z-]+(\?[a-zA-Z]+=[a-z0-9-]+)?$/)
  })

  it("points the catalogue shortcuts at filters the catalogue accepts", () => {
    const byLabel = Object.fromEntries(navLinks.map((link) => [link.label, link.href]))
    const filters = (href: string) =>
      parseCatalogueQuery(Object.fromEntries(new URL(href, "http://localhost").searchParams))

    expect(byLabel["New arrivals"]).toMatch(/^\/products\?/)
    expect(filters(byLabel["New arrivals"]).sort).toBe("newest")
    expect(byLabel["Deals"]).toMatch(/^\/products\?/)
    expect(filters(byLabel["Deals"]).onSale).toBe(true)
  })
})

describe("static assets", () => {
  it.each(["hero-shopping", "secure-payment", "delivery", "gift"])(
    "ships the %s animation in /public",
    (name) => {
      expect(existsSync(path.join(process.cwd(), "public/animations", `${name}.lottie`))).toBe(true)
    }
  )
})
