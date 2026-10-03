import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { StarRatingInput } from "@/components/reviews/star-rating-input"

function setup(props: Partial<Parameters<typeof StarRatingInput>[0]> = {}) {
  const onChange = vi.fn()
  const { container } = render(
    <>
      <span id="rating-label">Your rating</span>
      <StarRatingInput name="rating" labelledBy="rating-label" onChange={onChange} {...props} />
    </>,
  )
  const group = screen.getByRole("radiogroup", { name: "Your rating" })
  const hidden = container.querySelector<HTMLInputElement>('input[type="hidden"][name="rating"]')!
  const checked = () => screen.queryAllByRole("radio").filter((r) => r.getAttribute("aria-checked") === "true")
  return { group, hidden, onChange, checked, user: userEvent.setup() }
}

describe("StarRatingInput", () => {
  it("renders five labelled stars with nothing picked and an empty value", () => {
    const { hidden, checked } = setup()

    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual([
      "1 star, Poor",
      "2 stars, Fair",
      "3 stars, Good",
      "4 stars, Very good",
      "5 stars, Excellent",
    ])
    expect(checked()).toEqual([])
    expect(hidden.value).toBe("")
    expect(screen.getByText("Select a rating")).toBeInTheDocument()
  })

  it("makes only the first star tabbable before a pick, and the picked one after", async () => {
    const { user } = setup()

    await user.tab()
    expect(screen.getByRole("radio", { name: /^1 star/ })).toHaveFocus()
    expect(screen.getAllByRole("radio").map((r) => r.tabIndex)).toEqual([0, -1, -1, -1, -1])

    await user.click(screen.getByRole("radio", { name: /^4 stars/ }))
    expect(screen.getAllByRole("radio").map((r) => r.tabIndex)).toEqual([-1, -1, -1, 0, -1])
  })

  it("picks a star on click and posts its value", async () => {
    const { user, hidden, onChange, checked } = setup()

    await user.click(screen.getByRole("radio", { name: /^3 stars/ }))

    expect(hidden.value).toBe("3")
    expect(onChange).toHaveBeenLastCalledWith(3)
    expect(checked().map((r) => r.getAttribute("aria-label"))).toEqual(["3 stars, Good"])
    expect(screen.getByText("Good")).toBeInTheDocument()
  })

  it("moves and picks with the arrow keys, stopping at 1 and 5, and keeps focus on the pick", async () => {
    const { user, hidden } = setup()
    await user.tab()

    await user.keyboard("{ArrowRight}")
    expect(hidden.value).toBe("1")
    await user.keyboard("{ArrowRight}{ArrowUp}")
    expect(hidden.value).toBe("3")
    expect(screen.getByRole("radio", { name: /^3 stars/ })).toHaveFocus()
    await user.keyboard("{ArrowLeft}{ArrowDown}{ArrowDown}{ArrowLeft}")
    expect(hidden.value).toBe("1")
    await user.keyboard("{End}{ArrowRight}")
    expect(hidden.value).toBe("5")
    expect(screen.getByRole("radio", { name: /^5 stars/ })).toHaveFocus()
    await user.keyboard("{Home}")
    expect(hidden.value).toBe("1")
  })

  it("picks directly with the digits 1–5 and ignores other keys", async () => {
    const { user, hidden, onChange } = setup()
    await user.tab()

    await user.keyboard("4")
    expect(hidden.value).toBe("4")
    onChange.mockClear()
    await user.keyboard("7a0")
    expect(hidden.value).toBe("4")
    expect(onChange).not.toHaveBeenCalled()
  })

  it("starts from a default value", () => {
    setup({ defaultValue: 2 })
    expect(screen.getByRole("radio", { name: /^2 stars/ })).toHaveAttribute("aria-checked", "true")
  })

  it("treats an out-of-range default as no pick", () => {
    const { hidden } = setup({ defaultValue: 9 })
    expect(hidden.value).toBe("")
  })

  it("marks the group invalid and links its error", () => {
    const { group } = setup({ invalid: true, describedBy: "rating-error" })
    expect(group).toHaveAttribute("aria-invalid", "true")
    expect(group).toHaveAttribute("aria-describedby", "rating-error")
  })
})
