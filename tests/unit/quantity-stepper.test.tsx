import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { QuantityStepper } from "@/components/cart/quantity-stepper"

const dec = () => screen.getByRole("button", { name: /^Decrease quantity/ })
const inc = () => screen.getByRole("button", { name: /^Increase quantity/ })
const input = () => screen.getByRole("textbox", { name: /^Quantity/ })

/** A controlled stepper, like its callers use it; `onChange` records each committed value. */
function Controlled({ initial, max, onChange }: { initial: number; max: number; onChange: (n: number) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <QuantityStepper
      value={value}
      max={max}
      onValueChange={(next) => {
        onChange(next)
        setValue(next)
      }}
    />
  )
}

describe("QuantityStepper", () => {
  it("steps up and down by one", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled initial={2} max={5} onChange={onChange} />)

    await user.click(inc())
    expect(input()).toHaveValue("3")
    await user.click(dec())
    await user.click(dec())
    expect(input()).toHaveValue("1")
    expect(onChange.mock.calls.map(([n]) => n)).toEqual([3, 2, 1])
  })

  it("disables − at the minimum of 1 and + at the maximum", async () => {
    const user = userEvent.setup()
    render(<Controlled initial={1} max={2} onChange={vi.fn()} />)

    expect(dec()).toBeDisabled()
    expect(inc()).toBeEnabled()
    await user.click(inc())
    expect(input()).toHaveValue("2")
    expect(inc()).toBeDisabled()
    expect(dec()).toBeEnabled()
  })

  it("disables both buttons when min and max are both 1", () => {
    render(<QuantityStepper value={1} max={1} onValueChange={vi.fn()} />)
    expect(dec()).toBeDisabled()
    expect(inc()).toBeDisabled()
  })

  it("disables everything when there's nothing to choose from (max 0) or when disabled", () => {
    const { rerender } = render(<QuantityStepper value={1} max={0} onValueChange={vi.fn()} />)
    expect(dec()).toBeDisabled()
    expect(inc()).toBeDisabled()
    expect(input()).toBeDisabled()

    rerender(<QuantityStepper value={2} max={5} onValueChange={vi.fn()} disabled />)
    expect(dec()).toBeDisabled()
    expect(inc()).toBeDisabled()
    expect(input()).toBeDisabled()
  })

  it("commits a typed value on Enter or blur, not on each keystroke", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled initial={1} max={50} onChange={onChange} />)

    await user.clear(input())
    await user.type(input(), "12")
    expect(onChange).not.toHaveBeenCalled()
    await user.keyboard("{Enter}")
    expect(onChange).toHaveBeenCalledExactlyOnceWith(12)

    await user.clear(input())
    await user.type(input(), "7")
    await user.tab()
    expect(onChange).toHaveBeenLastCalledWith(7)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it("clamps a typed value to the bounds", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled initial={3} max={8} onChange={onChange} />)

    await user.clear(input())
    await user.type(input(), "40{Enter}")
    expect(onChange).toHaveBeenLastCalledWith(8)
    expect(input()).toHaveValue("8")

    await user.clear(input())
    await user.type(input(), "0{Enter}")
    expect(onChange).toHaveBeenLastCalledWith(1)
    expect(input()).toHaveValue("1")
  })

  it("reverts an empty input without committing, and drops non-digits as they're typed", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled initial={4} max={8} onChange={onChange} />)

    await user.clear(input())
    await user.tab()
    expect(input()).toHaveValue("4")

    await user.clear(input())
    await user.type(input(), "-a5")
    expect(input()).toHaveValue("5")
    await user.keyboard("{Enter}")
    expect(onChange).toHaveBeenCalledExactlyOnceWith(5)
  })

  it("doesn't commit a typed value equal to the current one", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled initial={4} max={8} onChange={onChange} />)

    await user.clear(input())
    await user.type(input(), "4{Enter}")
    expect(onChange).not.toHaveBeenCalled()
  })

  it("steps straight down to the maximum from a value above it", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<QuantityStepper value={7} max={3} onValueChange={onChange} />)

    expect(inc()).toBeDisabled()
    await user.click(dec())
    expect(onChange).toHaveBeenCalledExactlyOnceWith(3)
  })

  it("shows a new value passed in from outside", () => {
    const { rerender } = render(<QuantityStepper value={2} max={9} onValueChange={vi.fn()} />)
    rerender(<QuantityStepper value={6} max={9} onValueChange={vi.fn()} />)
    expect(input()).toHaveValue("6")
  })

  it("names the product in its labels", () => {
    render(<QuantityStepper value={2} max={9} onValueChange={vi.fn()} productName="Aria" />)

    expect(screen.getByRole("group", { name: "Quantity of Aria" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Quantity of Aria" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Decrease quantity of Aria" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Increase quantity of Aria" })).toBeInTheDocument()
  })
})
