import Link from "next/link"
import { ArrowRight, Star } from "lucide-react"

import { HeroStats } from "@/components/home/hero-stats"
import { LottieAnimation } from "@/components/lottie-animation"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,var(--color-muted),transparent_60%)]" />
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-2 lg:px-8">
        <div className="space-y-6">
          <Badge variant="secondary" className="gap-1">
            <Star className="fill-current" /> New autumn collection is live
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Shop the things you&apos;ll actually love.
          </h1>
          <p className="max-w-lg text-lg text-muted-foreground">
            Curated audio, watches, footwear and more — delivered fast, paid for safely, and easy to
            return if it&apos;s not quite right.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/products" className={buttonVariants({ size: "lg", className: "h-11 px-5" })}>
              Shop now <ArrowRight data-icon="inline-end" />
            </Link>
            <Link
              href="/categories"
              className={buttonVariants({ size: "lg", variant: "outline", className: "h-11 px-5" })}
            >
              Browse categories
            </Link>
          </div>
          <HeroStats />
        </div>
        <LottieAnimation
          src="/animations/hero-shopping.lottie"
          label="Shopper riding a shopping cart through a store"
          className="mx-auto -my-8 max-w-md lg:max-w-lg"
        />
      </div>
    </section>
  )
}
