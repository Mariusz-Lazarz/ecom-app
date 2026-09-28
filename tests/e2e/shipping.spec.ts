import { expect, test } from "@playwright/test"

import { shippingMethods } from "../../src/lib/shipping"

test.describe("shipping page", () => {
  test("is reachable from the homepage and the footer", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("link", { name: "Shipping details" }).click()
    await expect(page).toHaveURL("/help/shipping")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shipping & delivery")

    await page.goto("/")
    await page.getByRole("contentinfo").getByRole("link", { name: "Shipping" }).click()
    await expect(page).toHaveURL("/help/shipping")
  })

  test("loads without errors and with its own title", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))

    const response = await page.goto("/help/shipping")

    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle("Shipping & delivery — Northcart")
    for (const method of shippingMethods) {
      await expect(page.getByRole("article", { name: method.name })).toBeVisible()
    }
    expect(errors).toEqual([])
  })

  test("recalculates the estimate as the subtotal and method change", async ({ page }) => {
    await page.goto("/help/shipping")

    const estimate = page.getByRole("definition")
    await expect(estimate).toHaveText(["$5.99", "3–5 business days"])

    await page.getByRole("slider", { name: "Order subtotal" }).fill("80")
    await expect(page.getByRole("status")).toHaveText("$80.00")
    await expect(estimate).toHaveText(["Free", "3–5 business days"])

    await page.getByRole("radio", { name: "Express" }).check()
    await expect(estimate).toHaveText(["$12.99", "1–2 business days"])
  })

  test("jumps to the estimator and opens FAQ answers", async ({ page }) => {
    await page.goto("/help/shipping")

    await page.getByRole("link", { name: /estimate your shipping/i }).click()
    await expect(page.getByRole("slider", { name: "Order subtotal" })).toBeInViewport()

    const answer = page.getByText(/leave our warehouse the same day\. Anything later/)
    await expect(answer).toBeHidden()
    await page.getByText("When will my order ship?").click()
    await expect(answer).toBeVisible()
  })

  test("never scrolls horizontally", async ({ page }) => {
    await page.goto("/help/shipping")

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })
})
