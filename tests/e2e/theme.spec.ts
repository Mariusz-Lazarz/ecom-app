import { expect, test, type Page } from "@playwright/test"

// Start from a light OS preference so "dark" can only come from the user's choice.
test.use({ colorScheme: "light" })

const html = (page: Page) => page.locator("html")

async function chooseDark(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole("button", { name: "Open menu" }).click()
    await page.getByRole("dialog").getByRole("group", { name: "Theme" }).getByRole("button", { name: "Dark" }).click()
    await page.keyboard.press("Escape")
  } else {
    await page.getByRole("banner").getByRole("button", { name: "Change theme" }).click()
    await page.getByRole("menuitemradio", { name: "Dark" }).click()
  }
}

test("switching to dark adds the dark class and survives a reload", async ({ page, isMobile }) => {
  await page.goto("/")
  await expect(html(page)).not.toHaveClass(/\bdark\b/)

  await chooseDark(page, isMobile)
  await expect(html(page)).toHaveClass(/\bdark\b/)
  await expect(html(page)).toHaveCSS("color-scheme", "dark")

  await page.reload()
  await expect(html(page)).toHaveClass(/\bdark\b/)
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("dark")

  // The choice applies across pages, not just the one it was made on.
  await page.goto("/products")
  await expect(html(page)).toHaveClass(/\bdark\b/)
})

test("System follows the OS preference", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" })
  await page.goto("/")
  await expect(html(page)).toHaveClass(/\bdark\b/)

  await page.emulateMedia({ colorScheme: "light" })
  await expect(html(page)).not.toHaveClass(/\bdark\b/)
})
