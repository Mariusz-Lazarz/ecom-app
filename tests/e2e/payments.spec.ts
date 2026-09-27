import { expect, test } from "@playwright/test"

import { paymentMethods } from "../../src/lib/payments"

test.describe("payment options page", () => {
  test("is reachable from the homepage and the footer", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("link", { name: "Payment options" }).click()
    await expect(page).toHaveURL("/help/payments")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Payment options")

    await page.goto("/")
    await page.getByRole("contentinfo").getByRole("link", { name: "Payments" }).click()
    await expect(page).toHaveURL("/help/payments")
  })

  test("loads without errors and with its own title", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))

    const response = await page.goto("/help/payments")

    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle("Payment options — Northcart")
    for (const method of paymentMethods) {
      await expect(page.getByRole("article", { name: method.name })).toBeVisible()
    }
    expect(errors).toEqual([])
  })

  test("recalculates Pay-in-4 as the slider moves", async ({ page }) => {
    await page.goto("/help/payments")

    const slider = page.getByRole("slider", { name: "Order total" })
    const schedule = page.getByRole("list", { name: "Payment schedule" }).getByRole("listitem")
    await expect(schedule.first()).toContainText("$60.00")

    await slider.fill("500")
    await expect(page.getByRole("status")).toHaveText("$500.00")
    await expect(schedule).toHaveCount(4)
    for (const item of await schedule.all()) await expect(item).toContainText("$125.00")
  })

  test("jumps to the calculator and opens FAQ answers", async ({ page }) => {
    await page.goto("/help/payments")

    await page.getByRole("link", { name: /pay-in-4 calculator/i }).click()
    await expect(page.getByRole("slider", { name: "Order total" })).toBeInViewport()

    const answer = page.getByText(/money once your parcel ships/)
    await expect(answer).toBeHidden()
    await page.getByText("When will I be charged?").click()
    await expect(answer).toBeVisible()
  })

  test("never scrolls horizontally", async ({ page }) => {
    await page.goto("/help/payments")

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })
})
