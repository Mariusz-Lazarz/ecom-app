"use client"

import { DotLottieReact } from "@lottiefiles/dotlottie-react"
import { cn } from "@/lib/utils"

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
