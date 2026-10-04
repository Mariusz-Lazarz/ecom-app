import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

const { RangeTabs } = await import("@/components/admin/analytics/range-tabs")
const { DeltaText } = await import("@/components/admin/analytics/delta")

beforeEach(() => push.mockReset())

describe("RangeTabs", () => {
  it("marks the current range and puts the report in its panel", () => {
    render(
      <RangeTabs range="90d">
        <p>Report</p>
      </RangeTabs>,
    )

    expect(screen.getAllByRole("tab").map((tab) => [tab.textContent, tab.getAttribute("aria-selected")])).toEqual([
      ["7 days", "false"],
      ["30 days", "false"],
      ["90 days", "true"],
      ["All time", "false"],
    ])
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Report")
  })

  it("navigates to the chosen range, leaving the default out of the URL", async () => {
    const user = userEvent.setup()
    render(
      <RangeTabs range="7d" actions={<a href="/export">Export</a>}>
        <p>Report</p>
      </RangeTabs>,
    )

    await user.click(screen.getByRole("tab", { name: "All time" }))
    await user.click(screen.getByRole("tab", { name: "30 days" }))

    expect(push.mock.calls).toEqual([
      ["/admin/analytics?range=all", { scroll: false }],
      ["/admin/analytics", { scroll: false }],
    ])
    expect(screen.getByRole("link", { name: "Export" })).toBeInTheDocument()
  })
})

describe("DeltaText", () => {
  it.each([
    [{ direction: "up", percent: 12.5 } as const, "+12.5%", "up 12.5%", "text-emerald-700"],
    [{ direction: "down", percent: 3 } as const, "−3%", "down 3%", "text-red-700"],
    [{ direction: "flat", percent: 0 } as const, "0%", "no change", "text-muted-foreground"],
    [{ direction: "new", percent: null } as const, "New", "up from zero", "text-emerald-700"],
  ])("shows %o with an icon, the text and the words", (delta, text, words, colour) => {
    const { container } = render(<DeltaText delta={delta} />)

    const root = container.firstElementChild!
    expect(root).toHaveClass(colour)
    expect(root.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
    expect(screen.getByText(text)).toHaveAttribute("aria-hidden")
    expect(screen.getByText(words)).toHaveClass("sr-only")
  })
})
