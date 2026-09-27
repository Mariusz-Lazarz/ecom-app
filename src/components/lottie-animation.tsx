"use client"

import { DotLottieReact, setWasmUrl } from "@lottiefiles/dotlottie-react"
import { cn } from "@/lib/utils"

// Serve the renderer ourselves instead of the player's default jsDelivr/unpkg download.
// Keep public/lottie/dotlottie-player.wasm in sync with the installed @lottiefiles/dotlottie-web.
export const LOTTIE_WASM_URL = "/lottie/dotlottie-player.wasm"
setWasmUrl(LOTTIE_WASM_URL)

type LottieAnimationProps = {
  src: string
  label: string
  className?: string
}

export function LottieAnimation({ src, label, className }: LottieAnimationProps) {
  return (
    <div role="img" aria-label={label} className={cn("aspect-square w-full", className)}>
      <DotLottieReact src={src} loop autoplay className="size-full" />
    </div>
  )
}
