import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import ErrorPage from "@/app/error"

describe("error boundary page", () => {
  it("shows the digest and retries on click", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const retry = vi.fn()
    const error = Object.assign(new Error("boom"), { digest: "abc123" })
    render(<ErrorPage error={error} retry={retry} />)

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument()
    expect(screen.getByText("Error ID: abc123")).toBeInTheDocument()
    expect(screen.queryByText("boom")).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(retry).toHaveBeenCalledOnce()
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/")
  })
})
