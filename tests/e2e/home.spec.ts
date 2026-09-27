import { expect, test, type Page } from "@playwright/test"

import { featuredProducts, navLinks, siteConfig } from "../../src/lib/data"

const animations = ["hero-shopping", "secure-payment", "delivery", "gift"]

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 0) < 768

// Don't use "networkidle": while /products etc. don't exist yet, Next's router leaves the 404
// prefetch responses open, so the network never goes idle. Wait for what the page actually needs.
async function waitForMedia(page: Page) {
  await page.waitForLoadState("load")
  // Product photos are lazy-loaded, so only the hero animation is guaranteed to start without scrolling
  await expect(page.getByRole("img", { name: /shopping cart/i }).locator("canvas")).toBeVisible()
}

test.describe("home page", () => {
  test("loads without errors and with the store's metadata", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    page.on("console", (msg) => {
      if (msg.type() !== "error") return
      const source = msg.location().url
      // Linked pages like /products aren't built yet, so Next's route prefetches 404. Any other failure counts.
      const isPendingRoutePrefetch = msg.text().includes("404") && new URL(source).searchParams.has("_rsc")
      if (!isPendingRoutePrefetch) errors.push(`${msg.text()} (${source})`)
    })

    const response = await page.goto("/")
    await waitForMedia(page)

    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle(new RegExp(siteConfig.name))
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /fast delivery/)
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    expect(errors).toEqual([])
  })

  test("renders all sections in order", async ({ page }) => {
    await page.goto("/")

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shop the things you'll actually love.")
    await expect(page.getByRole("heading", { level: 2 })).toHaveText([
      "Shop by category",
      "Featured products",
      "Pay your way, safely.",
      "At your door in days, not weeks.",
      "Get 10% off your first order",
    ])
  })

  test("serves every product photo through the image optimiser", async ({ page }) => {
    const imageResponses: { url: string; status: number }[] = []
    page.on("response", (res) => {
      if (res.url().includes("/_next/image")) imageResponses.push({ url: res.url(), status: res.status() })
    })

    await page.goto("/")

    for (const product of featuredProducts) {
      const image = page.getByAltText(product.name)
      await image.scrollIntoViewIfNeeded()
      // naturalWidth is 0 when the optimiser rejects the URL (e.g. remotePatterns mismatch)
      await expect
        .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
        .toBeGreaterThan(0)
    }

    expect(imageResponses.length).toBeGreaterThanOrEqual(featuredProducts.length)
    expect(imageResponses.filter((r) => r.status !== 200)).toEqual([])
  })

  test("loads nothing from third-party hosts except via our image optimiser", async ({ page, baseURL }) => {
    const externalRequests: string[] = []
    page.on("request", (req) => {
      if (new URL(req.url()).origin !== new URL(baseURL!).origin) externalRequests.push(req.url())
    })

    await page.goto("/")
    await waitForMedia(page)
    // Scroll through the page so lazy photos and every animation's renderer get requested
    for (const product of featuredProducts) await page.getByAltText(product.name).scrollIntoViewIfNeeded()
    await page.getByRole("img", { name: /gift box/i }).scrollIntoViewIfNeeded()
    await page.waitForTimeout(1_000)

    expect(externalRequests).toEqual([])
  })

  test("serves the self-hosted Lottie renderer as WebAssembly", async ({ request }) => {
    const res = await request.get("/lottie/dotlottie-player.wasm")
    expect(res.status()).toBe(200)
    // WebAssembly.instantiateStreaming requires this exact MIME type
    expect(res.headers()["content-type"]).toBe("application/wasm")
    const body = await res.body()
    expect(body.subarray(0, 4)).toEqual(Buffer.from([0x00, 0x61, 0x73, 0x6d])) // "\0asm"
  })

  test("serves every Lottie file as a valid .lottie archive", async ({ request }) => {
    for (const name of animations) {
      const res = await request.get(`/animations/${name}.lottie`)
      expect(res.status(), name).toBe(200)
      const body = await res.body()
      // .lottie files are zip archives, which start with the "PK" signature
      expect(body.subarray(0, 2).toString("latin1"), name).toBe("PK")
    }
  })

  test("actually draws the animations on their canvases", async ({ page }) => {
    await page.goto("/")

    const players = page.locator('[role="img"] canvas')
    await expect(players).toHaveCount(animations.length)

    for (let i = 0; i < animations.length; i++) {
      const canvas = players.nth(i)
      await canvas.scrollIntoViewIfNeeded()
      await expect(canvas).toBeVisible()
      // A canvas that failed to load stays fully transparent; count painted pixels instead of trusting the DOM.
      await expect
        .poll(
          () =>
            canvas.evaluate((el: HTMLCanvasElement) => {
              if (!el.width || !el.height) return 0
              const probe = document.createElement("canvas")
              probe.width = el.width
              probe.height = el.height
              const ctx = probe.getContext("2d")!
              ctx.drawImage(el, 0, 0)
              const { data } = ctx.getImageData(0, 0, el.width, el.height)
              let painted = 0
              for (let p = 3; p < data.length; p += 4) if (data[p] > 0) painted++
              return painted
            }),
          { message: `animation ${animations[i]} should paint pixels`, timeout: 10_000 }
        )
        .toBeGreaterThan(100)
    }
  })

  test("links every category tile and product card to its page", async ({ page, request }) => {
    const { categories } = (await (await request.get("/api/categories")).json()) as {
      categories: { slug: string; name: string }[]
    }
    expect(categories.length).toBeGreaterThan(0)

    await page.goto("/")

    for (const category of categories) {
      await expect(page.getByRole("link", { name: new RegExp(`^${category.name}`) }).first()).toHaveAttribute(
        "href",
        `/categories/${category.slug}`
      )
    }
    for (const product of featuredProducts) {
      await expect(page.getByRole("link", { name: product.name, exact: true })).toHaveAttribute(
        "href",
        `/products/${product.slug}`
      )
    }
  })

  test("keeps the header pinned to the top while scrolling", async ({ page }) => {
    await page.goto("/")

    await page.getByRole("heading", { name: "Get 10% off your first order" }).scrollIntoViewIfNeeded()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500)

    const box = await page.getByRole("banner").boundingBox()
    expect(box?.y).toBe(0)
    await expect(page.getByRole("link", { name: siteConfig.name }).first()).toBeInViewport()
  })

  test("never scrolls horizontally", async ({ page }) => {
    await page.goto("/")
    await waitForMedia(page)

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })

  test("blocks newsletter submission with an invalid email", async ({ page }) => {
    await page.goto("/")

    const email = page.getByLabel("Email address")
    await email.fill("not-an-email")
    await page.getByRole("button", { name: "Subscribe" }).click()

    expect(await email.evaluate((el: HTMLInputElement) => el.validity.typeMismatch)).toBe(true)
    // Native validation stops the GET submit, so the URL gains no query string
    expect(new URL(page.url()).search).toBe("")
  })

  test("lets keyboard users reach each product once", async ({ page }) => {
    await page.goto("/")

    // Walk the whole tab order once; stop when focus wraps back to an element we've already visited.
    const focusedHrefs: string[] = []
    await page.evaluate(() => document.querySelectorAll("*").forEach((el, i) => el.setAttribute("data-tab-id", String(i))))
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      await page.keyboard.press("Tab")
      const { id, href } = await page.evaluate(() => ({
        id: document.activeElement?.getAttribute("data-tab-id") ?? "body",
        href: document.activeElement?.getAttribute("href") ?? null,
      }))
      if (seen.has(id)) break
      seen.add(id)
      if (href?.startsWith("/products/")) focusedHrefs.push(href)
    }

    expect(focusedHrefs).toEqual(featuredProducts.map((p) => `/products/${p.slug}`))
  })
})

test.describe("desktop navigation", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, "desktop only")

  test("shows the inline nav and hides the menu button", async ({ page }) => {
    await page.goto("/")

    const nav = page.getByRole("banner").getByRole("navigation")
    for (const link of navLinks) {
      await expect(nav.getByRole("link", { name: link.label })).toBeVisible()
    }
    await expect(page.getByRole("button", { name: "Open menu" })).toBeHidden()
  })

  test("shows the animation next to the hero copy", async ({ page }) => {
    await page.goto("/")

    const heading = await page.getByRole("heading", { level: 1 }).boundingBox()
    const animation = await page.getByRole("img", { name: /shopping cart/i }).boundingBox()
    expect(animation!.x).toBeGreaterThan(heading!.x + heading!.width)
  })
})

test.describe("mobile navigation", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 768, "mobile only")

  test("hides the inline nav behind a menu button", async ({ page }) => {
    await page.goto("/")

    await expect(page.getByRole("banner").getByRole("navigation")).toBeHidden()
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible()
  })

  test("opens and closes the slide-out menu", async ({ page }) => {
    await page.goto("/")
    expect(isMobile(page)).toBe(true)

    await page.getByRole("button", { name: "Open menu" }).click()
    const dialog = page.getByRole("dialog", { name: siteConfig.name })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("link")).toHaveText(navLinks.map((l) => l.label))

    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()

    await page.getByRole("button", { name: "Open menu" }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole("button", { name: "Close" }).click()
    await expect(dialog).toBeHidden()
  })

  test("stacks the hero animation below the copy", async ({ page }) => {
    await page.goto("/")

    const heading = await page.getByRole("heading", { level: 1 }).boundingBox()
    const animation = await page.getByRole("img", { name: /shopping cart/i }).boundingBox()
    expect(animation!.y).toBeGreaterThan(heading!.y + heading!.height)
  })
})
