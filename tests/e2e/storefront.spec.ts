import { expect, test, type APIRequestContext, type Page } from "@playwright/test"

// Runs against the seeded catalogue (npm run db:seed). Counts come from the API rather than being
// hard-coded, so the specs don't depend on exactly how many products the seed has.

type ApiList = { total: number; items: { slug: string; name: string; priceCents: number }[] }

async function apiList(request: APIRequestContext, search = "") {
  const res = await request.get(`/api/products${search}`)
  expect(res.status()).toBe(200)
  return (await res.json()) as ApiList
}

const cards = (page: Page) => page.getByRole("region", { name: "Products" }).locator('[data-slot="card"]')
const resultCount = (page: Page) => page.getByRole("region", { name: "Products" }).getByRole("status")
const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 768

const prices = (page: Page) =>
  cards(page).evaluateAll((els) =>
    els.map((card) => {
      // The first currency amount in a card is its current price.
      const text = card.querySelector(".font-semibold")?.textContent ?? ""
      return Number(text.replace(/[^0-9.]/g, ""))
    }),
  )

test.describe("catalogue", () => {
  test("lists the first page of products and pages through them", async ({ page, request }) => {
    const { total } = await apiList(request)

    const response = await page.goto("/products")
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle(/Shop all products/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("All products")
    await expect(resultCount(page)).toHaveText(`Showing 1–12 of ${total} products`)
    await expect(cards(page)).toHaveCount(12)

    const pagination = page.getByRole("navigation", { name: "Pagination" })
    await expect(pagination.getByRole("link", { name: "Page 1" })).toHaveAttribute("aria-current", "page")
    await pagination.getByRole("link", { name: /Next/ }).click()

    await expect(page).toHaveURL(/\/products\?page=2$/)
    await expect(resultCount(page)).toHaveText(`Showing 13–24 of ${total} products`)
    await expect(pagination.getByRole("link", { name: "Page 2" })).toHaveAttribute("aria-current", "page")
  })

  test("sorts by price and keeps the sort in the URL", async ({ page }) => {
    await page.goto("/products")

    await page.getByRole("combobox", { name: "Sort by" }).selectOption("price-asc")

    await expect(page).toHaveURL(/sort=price-asc/)
    await expect(page.getByRole("combobox", { name: "Sort by" })).toHaveValue("price-asc")
    await expect(cards(page)).toHaveCount(12)
    const values = await prices(page)
    expect(values).toEqual([...values].sort((a, b) => a - b))
  })

  test("falls back to defaults for invalid params instead of failing", async ({ page, request }) => {
    const { total } = await apiList(request)

    const response = await page.goto("/products?sort=cheapest&page=-4&onSale=maybe")

    expect(response?.status()).toBe(200)
    await expect(resultCount(page)).toHaveText(`Showing 1–12 of ${total} products`)
    await expect(page.getByRole("combobox", { name: "Sort by" })).toHaveValue("featured")
  })

  test("shows an empty state when nothing matches", async ({ page }) => {
    await page.goto("/products?q=no-such-product-anywhere")

    await expect(page.getByRole("heading", { name: "No products match your filters" })).toBeVisible()
    await expect(cards(page)).toHaveCount(0)
    await page.getByRole("link", { name: "Clear filters" }).click()
    await expect(page).toHaveURL(/\/products$/)
    await expect(cards(page)).toHaveCount(12)
  })

  test("never scrolls horizontally", async ({ page }) => {
    await page.goto("/products?onSale=true")

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })
})

test.describe("categories", () => {
  test("lists every category and links each to its page", async ({ page, request }) => {
    const { categories } = (await (await request.get("/api/categories")).json()) as {
      categories: { slug: string; name: string }[]
    }

    await page.goto("/categories")

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Categories")
    for (const category of categories) {
      await expect(page.getByRole("main").getByRole("link", { name: new RegExp(`^${category.name}`) })).toHaveAttribute(
        "href",
        `/categories/${category.slug}`,
      )
    }
  })

  test("filters by category, then by sale, from the catalogue", async ({ page, request }) => {
    const bags = await apiList(request, "?category=bags")
    const bagsOnSale = await apiList(request, "?category=bags&onSale=true")
    expect(bagsOnSale.total).toBeGreaterThan(0)

    await page.goto("/products")
    await page.getByRole("navigation", { name: "Categories" }).getByRole("link", { name: "Bags" }).click()

    await expect(page).toHaveURL(/\/categories\/bags$/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bags")
    await expect(page).toHaveTitle(/^Bags/)
    await expect(resultCount(page)).toHaveText(`Showing 1–${bags.total} of ${bags.total} products`)
    await expect(page.getByRole("link", { name: "Bags", exact: true }).first()).toHaveAttribute("aria-current", "page")

    await page.getByRole("link", { name: /On sale only/ }).click()

    await expect(page).toHaveURL(/\/categories\/bags\?onSale=true$/)
    await expect(cards(page)).toHaveCount(bagsOnSale.total)
    // Every sale card shows a struck-through "was" price.
    await expect(cards(page).filter({ has: page.locator(".line-through") })).toHaveCount(bagsOnSale.total)
  })

  test("returns 404 for an unknown category", async ({ page }) => {
    const response = await page.goto("/categories/no-such-category")

    expect(response?.status()).toBe(404)
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible()
  })
})

test.describe("search", () => {
  test("searches from the header and combines the search with filters", async ({ page, request }) => {
    const leather = await apiList(request, "?q=leather")
    const leatherOnSale = await apiList(request, "?q=leather&onSale=true")
    expect(leather.total).toBeGreaterThan(0)

    await page.goto("/")
    await page.getByRole("button", { name: "Search" }).click()
    const searchbox = page.getByRole("searchbox", { name: "Search products" })
    await expect(searchbox).toBeFocused()
    await searchbox.fill("leather")
    await searchbox.press("Enter")

    await expect(page).toHaveURL(/\/products\?q=leather$/)
    await expect(page.getByText("“leather”")).toBeVisible()
    await expect(resultCount(page)).toContainText(`of ${leather.total} product`)
    await expect(page.getByRole("search")).toBeHidden()

    await page.getByRole("link", { name: /On sale only/ }).click()
    await expect(page).toHaveURL(/q=leather&onSale=true/)
    await expect(resultCount(page)).toContainText(`of ${leatherOnSale.total} product`)

    await page.getByRole("link", { name: "Clear search" }).click()
    await expect(page).toHaveURL(/\/products\?onSale=true$/)
  })

  test("works from the mobile header too", async ({ page }) => {
    test.skip(!isMobile(page), "mobile only")

    await page.goto("/categories")
    await page.getByRole("button", { name: "Search" }).click()
    await expect(page.getByRole("searchbox", { name: "Search products" })).toBeInViewport()
    await page.getByRole("searchbox", { name: "Search products" }).fill("watch")
    await page.getByRole("button", { name: "Go" }).click()

    await expect(page).toHaveURL(/\/products\?q=watch$/)
    await expect(cards(page).first()).toBeVisible()
  })
})

test.describe("product page", () => {
  test("opens from a card and shows the product", async ({ page, request }) => {
    const [first] = (await apiList(request, "?pageSize=1")).items

    await page.goto("/products")
    await page.getByRole("link", { name: first.name, exact: true }).click()

    await expect(page).toHaveURL(`/products/${first.slug}`)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(first.name)
    await expect(page).toHaveTitle(new RegExp(`^${first.name}`))
    await expect(page.getByRole("heading", { name: "Specifications" })).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link")).toHaveCount(2)
  })

  test("switches the main photo from the thumbnails and loads it", async ({ page }) => {
    await page.goto("/products/halden-aria-anc-wireless-headphones")

    const main = page.getByRole("main").locator("img").first()
    const before = await main.getAttribute("src")
    const thumbnails = page.getByRole("button", { name: /^Show photo \d of \d$/ })
    await expect(thumbnails.first()).toHaveAttribute("aria-pressed", "true")

    await thumbnails.nth(1).click()

    await expect(thumbnails.nth(1)).toHaveAttribute("aria-pressed", "true")
    await expect(main).not.toHaveAttribute("src", before!)
    await expect.poll(() => main.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0)
  })

  test("shows related products and an honest add-to-cart", async ({ page }) => {
    await page.goto("/products/halden-aria-anc-wireless-headphones")

    const related = page.locator("section", { has: page.getByRole("heading", { name: "You may also like" }) })
    await expect(related.locator('[data-slot="card"]')).toHaveCount(4)

    await page.getByRole("button", { name: "Add to cart" }).click()
    await expect(page.getByText("Cart coming soon")).toBeVisible()
  })

  test("disables add-to-cart for an out-of-stock product", async ({ page }) => {
    await page.goto("/products/corda-stride-sport-earbuds")

    await expect(page.getByRole("main").getByText("Out of stock").first()).toBeVisible()
    await expect(page.getByRole("button", { name: "Out of stock" })).toBeDisabled()
  })

  test("returns 404 for an unknown product", async ({ page }) => {
    const response = await page.goto("/products/no-such-product")

    expect(response?.status()).toBe(404)
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible()
    await expect(page).toHaveTitle(/not found/i)
  })
})

test.describe("navigation shortcuts", () => {
  test("New arrivals and Deals open the catalogue sorted and filtered", async ({ page }) => {
    await page.goto("/")
    const open = async (label: string) => {
      if (isMobile(page)) {
        await page.getByRole("button", { name: "Open menu" }).click()
        await page.getByRole("dialog").getByRole("link", { name: label }).click()
      } else {
        await page.getByRole("banner").getByRole("link", { name: label }).click()
      }
    }

    await open("New arrivals")
    await expect(page).toHaveURL(/\/products\?sort=newest$/)
    await expect(page.getByRole("combobox", { name: "Sort by" })).toHaveValue("newest")

    await open("Deals")
    await expect(page).toHaveURL(/\/products\?onSale=true$/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Deals")
  })

  test("footer category links land on category pages", async ({ page }) => {
    await page.goto("/")
    const shop = page.getByRole("contentinfo").getByRole("heading", { name: "Shop" }).locator("..")
    const hrefs = await shop.getByRole("link").evaluateAll((links) => links.map((l) => l.getAttribute("href")!))
    expect(hrefs.length).toBeGreaterThan(0)

    for (const href of hrefs) {
      const response = await page.goto(href)
      expect(response?.status(), href).toBe(200)
      await expect(cards(page).first()).toBeVisible()
    }
  })
})
