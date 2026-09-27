import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

// The real player loads a WASM renderer and draws to <canvas>, neither of which jsdom supports.
// The stub exposes the props it received so tests can check how animations are configured.
vi.mock("@lottiefiles/dotlottie-react", () => ({
  setWasmUrl: vi.fn(),
  DotLottieReact: ({
    src,
    loop,
    autoplay,
    className,
  }: {
    src: string
    loop?: boolean
    autoplay?: boolean
    className?: string
  }) => (
    <canvas
      data-testid="dotlottie"
      data-src={src}
      data-loop={String(Boolean(loop))}
      data-autoplay={String(Boolean(autoplay))}
      className={className}
    />
  ),
}))

afterEach(() => {
  cleanup()
})
