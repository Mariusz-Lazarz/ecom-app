import { existsSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { categories, featuredProducts, navLinks } from "@/lib/data"
import nextConfig from "../../next.config"

const unique = <T,>(values: T[]) => new Set(values).size === values.length
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

describe("catalogue data", () => {
  it("uses unique, URL-safe slugs for categories and products", () => {
    for (const list of [categories, featuredProducts]) {
      const slugs = list.map((item) => item.slug)
      expect(unique(slugs)).toBe(true)
      for (const slug of slugs) expect(slug).toMatch(slugPattern)
    }
  })

  it("assigns every featured product to an existing category", () => {
    const categoryNames = categories.map((c) => c.name)
    for (const product of featuredProducts) {
      expect(categoryNames).toContain(product.category)
    }
  })

  it("keeps prices, discounts and ratings in sensible ranges", () => {
    for (const product of featuredProducts) {
      expect(product.price).toBeGreaterThan(0)
      if (product.compareAt !== undefined) expect(product.compareAt).toBeGreaterThan(product.price)
      expect(product.rating).toBeGreaterThanOrEqual(0)
      expect(product.rating).toBeLessThanOrEqual(5)
      expect(Number.isInteger(product.reviews)).toBe(true)
    }
  })

  it("keeps percentage badges consistent with the actual discount", () => {
    for (const product of featuredProducts) {
      const match = product.badge?.match(/^-(\d+)%$/)
      if (!match) continue
      expect(product.compareAt).toBeDefined()
      const discount = Math.round((1 - product.price / product.compareAt!) * 100)
      expect(discount).toBe(Number(match[1]))
    }
  })

  it("uses unique internal routes for navigation", () => {
    const hrefs = navLinks.map((link) => link.href)
    expect(unique(hrefs)).toBe(true)
    for (const href of hrefs) expect(href).toMatch(/^\/[a-z-]+$/)
  })
})

describe("product images vs. next.config remotePatterns", () => {
  const patterns = nextConfig.images?.remotePatterns ?? []

  // Mirrors the matching rules of the image optimiser: a URL that fails here makes /_next/image return 400.
  const isAllowed = (raw: string) => {
    const url = new URL(raw)
    return patterns.some((pattern) => {
      if (pattern instanceof URL) return false
      const pathRe = new RegExp(
        "^" + (pattern.pathname ?? "/**").replace(/\*\*/g, ".*").replace(/(?<!\.)\*/g, "[^/]*") + "$"
      )
      return (
        url.protocol === `${pattern.protocol ?? "https"}:` &&
        url.hostname === pattern.hostname &&
        pathRe.test(url.pathname) &&
        (pattern.search === undefined || url.search === pattern.search)
      )
    })
  }

  it("allows every featured product image through the optimiser", () => {
    for (const product of featuredProducts) {
      expect(isAllowed(product.image), product.image).toBe(true)
    }
  })

  it("does not allow arbitrary URLs on the same host", () => {
    expect(isAllowed("https://images.unsplash.com/photo-123?w=4000")).toBe(false)
    expect(isAllowed("https://evil.example.com/photo-123?w=600&q=80&auto=format&fit=crop")).toBe(false)
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
