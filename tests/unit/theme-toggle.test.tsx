import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const setTheme = vi.fn()
const themeState: { theme: string | undefined } = { theme: "system" }
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: themeState.theme, setTheme, themes: ["light", "dark", "system"] }),
}))

const { ThemeSwitcher, ThemeToggle } = await import("@/components/theme/theme-toggle")

beforeEach(() => {
  setTheme.mockReset()
  themeState.theme = "system"
})

describe("ThemeToggle", () => {
  it("is a labelled button with a closed menu", () => {
    render(<ThemeToggle />)

    const trigger = screen.getByRole("button", { name: "Change theme" })
    expect(trigger).toHaveAttribute("aria-haspopup", "menu")
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })

  it("lists Light, Dark and System with the current theme checked", async () => {
    themeState.theme = "dark"
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole("button", { name: "Change theme" }))

    const items = within(await screen.findByRole("menu")).getAllByRole("menuitemradio")
    expect(items.map((item) => item.textContent)).toEqual(["Light", "Dark", "System"])
    expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual(["false", "true", "false"])
  })

  it("checks System before a theme has been resolved", async () => {
    themeState.theme = undefined
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole("button", { name: "Change theme" }))

    expect(await screen.findByRole("menuitemradio", { name: "System" })).toHaveAttribute("aria-checked", "true")
  })

  it.each([
    ["Light", "light"],
    ["Dark", "dark"],
  ])("sets the %s theme and closes the menu", async (label, value) => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole("button", { name: "Change theme" }))
    await user.click(await screen.findByRole("menuitemradio", { name: label }))

    expect(setTheme).toHaveBeenCalledExactlyOnceWith(value)
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument())
  })

  it("switches back to System from an explicit theme", async () => {
    themeState.theme = "light"
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole("button", { name: "Change theme" }))
    await user.click(await screen.findByRole("menuitemradio", { name: "System" }))

    expect(setTheme).toHaveBeenCalledExactlyOnceWith("system")
  })
})

describe("ThemeSwitcher", () => {
  it("renders a Theme group with the current option pressed", () => {
    themeState.theme = "light"
    render(<ThemeSwitcher />)

    const group = screen.getByRole("group", { name: "Theme" })
    const buttons = within(group).getAllByRole("button")
    expect(buttons.map((b) => b.textContent)).toEqual(["Light", "Dark", "System"])
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"])
  })

  it("presses System when no theme is resolved yet", () => {
    themeState.theme = undefined
    render(<ThemeSwitcher />)

    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true")
  })

  it("sets the theme of the option that is pressed", async () => {
    const user = userEvent.setup()
    render(<ThemeSwitcher />)

    await user.click(screen.getByRole("button", { name: "Dark" }))

    expect(setTheme).toHaveBeenCalledExactlyOnceWith("dark")
  })

  it("keeps the theme when the active option is pressed again", async () => {
    themeState.theme = "dark"
    const user = userEvent.setup()
    render(<ThemeSwitcher />)

    await user.click(screen.getByRole("button", { name: "Dark" }))

    expect(setTheme).not.toHaveBeenCalled()
  })
})
