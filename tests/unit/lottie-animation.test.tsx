import { readFileSync } from "node:fs"
import path from "node:path"

import { setWasmUrl } from "@lottiefiles/dotlottie-react"
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { LOTTIE_WASM_URL, LottieAnimation } from "@/components/lottie-animation"

describe("LottieAnimation", () => {
  it("exposes the animation to assistive tech as a labelled image", () => {
    render(<LottieAnimation src="/animations/gift.lottie" label="Gift box bouncing" />)

    expect(screen.getByRole("img", { name: "Gift box bouncing" })).toBeInTheDocument()
  })

  it("plays the given file on a loop, starting automatically", () => {
    render(<LottieAnimation src="/animations/gift.lottie" label="Gift" />)

    const player = within(screen.getByRole("img", { name: "Gift" })).getByTestId("dotlottie")
    expect(player).toHaveAttribute("data-src", "/animations/gift.lottie")
    expect(player).toHaveAttribute("data-loop", "true")
    expect(player).toHaveAttribute("data-autoplay", "true")
    expect(player).toHaveClass("size-full")
  })

  it("keeps the square aspect ratio while merging custom classes", () => {
    render(<LottieAnimation src="/a.lottie" label="Anim" className="max-w-md w-40" />)

    const wrapper = screen.getByRole("img", { name: "Anim" })
    expect(wrapper).toHaveClass("aspect-square", "max-w-md", "w-40")
    // tailwind-merge semantics: the caller's width wins over the default w-full
    expect(wrapper).not.toHaveClass("w-full")
  })

  it("points the renderer at our own origin before any player mounts", async () => {
    vi.mocked(setWasmUrl).mockClear()
    vi.resetModules()
    // Fresh import: the URL must be configured as a module side effect, not lazily on first render
    const fresh = await import("@/components/lottie-animation")
    const { setWasmUrl: freshSetWasmUrl } = await import("@lottiefiles/dotlottie-react")

    expect(vi.mocked(freshSetWasmUrl)).toHaveBeenCalledExactlyOnceWith(fresh.LOTTIE_WASM_URL)
    // Same-origin absolute path, not a protocol-relative or external URL
    expect(fresh.LOTTIE_WASM_URL).toMatch(/^\/[^/]/)
  })

  it("ships the exact WASM build of the installed player package", () => {
    // After upgrading @lottiefiles/dotlottie-web, copy the new .wasm into public/lottie or this fails.
    const shipped = readFileSync(path.join(process.cwd(), "public", LOTTIE_WASM_URL))
    const installed = readFileSync(
      path.join(process.cwd(), "node_modules/@lottiefiles/dotlottie-web/dist/dotlottie-player.wasm")
    )
    expect(shipped.equals(installed)).toBe(true)
  })
})
