import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Heart, Leaf, Search, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react"

import { PageHero } from "@/components/content/page-hero"
import { SectionHeading } from "@/components/home/section-heading"
import { LottieAnimation } from "@/components/lottie-animation"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { siteConfig } from "@/lib/data"
import { returnPolicy } from "@/lib/returns"
import { shippingRules } from "@/lib/shipping"

export const metadata: Metadata = {
  title: "About us — Northcart",
  description: `${siteConfig.name} is a small shop of everyday goods, thoughtfully picked: fewer, better things that last.`,
}

const values: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Search, title: "Picked, not piled up", text: "Every product is tried by someone on the team before it goes on the shelf. If we wouldn't buy it, we don't sell it." },
  { icon: Leaf, title: "Made to last", text: "We favour repairable, well-made things over the newest model, and we tell you honestly when something isn't built for heavy use." },
  { icon: ShieldCheck, title: "No small print", text: `Free shipping over $${shippingRules.freeThreshold}, ${returnPolicy.windowDays}-day free returns and prices that include everything you pay at checkout.` },
  { icon: Heart, title: "People first", text: "Real humans answer every message, usually within one business day. No bots, no scripts." },
]

const stats = [
  { value: "2019", label: "Founded in a garage" },
  { value: "80+", label: "Hand-picked products" },
  { value: "4.6★", label: "Average review" },
  { value: "1 day", label: "Typical reply time" },
]

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <PageHero
          badge={
            <>
              <Sparkles /> Our story
            </>
          }
          title="Everyday goods, thoughtfully picked."
          description={
            <p>
              {siteConfig.name} started with a simple frustration: finding a good pair of headphones, a decent
              backpack or a watch that lasts shouldn&apos;t mean wading through a thousand listings. So we did the
              wading for you.
            </p>
          }
          aside={
            <LottieAnimation
              src="/animations/hero-shopping.lottie"
              label="Shopper riding a shopping cart through a store"
              className="mx-auto max-w-sm"
            />
          }
        >
          <Link href="/products" className={buttonVariants({ size: "lg", className: "h-11 px-5" })}>
            Browse the shop <ArrowRight data-icon="inline-end" />
          </Link>
        </PageHero>

        <section className="border-y bg-muted/40">
          <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 md:grid-cols-4 lg:px-8">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col gap-1 text-center">
                <dt className="text-sm text-muted-foreground">{stat.label}</dt>
                <dd className="order-first text-3xl font-semibold tracking-tight">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mx-auto max-w-7xl space-y-8 px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading title="What we believe" description="Four promises behind everything we sell." />
          <div className="grid gap-4 sm:grid-cols-2">
            {values.map(({ icon: Icon, title, text }) => (
              <Card key={title}>
                <CardHeader>
                  <span className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <CardTitle className="text-lg">{title}</CardTitle>
                  <CardDescription>{text}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl space-y-5 px-4 pb-16 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">A small team, on purpose</h2>
          <p className="text-muted-foreground">
            We&apos;re a handful of people who care a little too much about stitching, battery life and the feel of
            a good button. We pack orders ourselves, write every product description, and read every review you
            leave, including the critical ones.
          </p>
          <p className="text-muted-foreground">
            {siteConfig.name} is a demo store: the products, brands and people are made up, and no real orders are
            shipped. Everything else (the cart, checkout, emails and admin tools) works for real.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/careers" className={buttonVariants({ variant: "outline" })}>
              Work with us
            </Link>
            <Link href="/help/contact" className={buttonVariants({ variant: "ghost" })}>
              Say hello
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
