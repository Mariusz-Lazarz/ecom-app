import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  ChevronDown,
  ClipboardCheck,
  MapPin,
  Package,
  PackageCheck,
  Plane,
  Rocket,
  Truck,
  Zap,
  type LucideIcon,
} from "lucide-react"

import { HelpNav } from "@/components/help/help-nav"
import { SectionHeading } from "@/components/home/section-heading"
import { LottieAnimation } from "@/components/lottie-animation"
import { ShippingEstimator } from "@/components/shipping/shipping-estimator"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  formatDeliveryWindow,
  shippingFaqs,
  shippingMethods,
  shippingRules,
  shippingZones,
  trackingSteps,
} from "@/lib/shipping"

export const metadata: Metadata = {
  title: "Shipping & delivery — Northcart",
  description: `Free standard shipping over $${shippingRules.freeThreshold}, same-day dispatch before 2 pm, express, next-day and locker pickup.`,
}

const methodIcons: Record<string, LucideIcon> = {
  standard: Truck,
  express: Zap,
  "next-day": Rocket,
  pickup: MapPin,
}

// Same order as trackingSteps
const stepIcons: LucideIcon[] = [ClipboardCheck, Package, Truck, PackageCheck]

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

export default function ShippingPage() {
  return (
    <>
      <SiteHeader />
      <HelpNav />
      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,var(--color-muted),transparent_60%)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-2 lg:px-8">
            <div className="space-y-6">
              <Badge variant="secondary" className="gap-1">
                <Truck /> Fast delivery
              </Badge>
              <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Shipping & delivery
              </h1>
              <p className="max-w-lg text-lg text-muted-foreground">
                Orders placed before 2 pm ship the same day. Pick the speed you need, track every step,
                and get free standard shipping on orders over ${shippingRules.freeThreshold}.
              </p>
              <a href="#estimate" className={buttonVariants({ size: "lg", className: "h-11 px-5" })}>
                Estimate your shipping <ArrowRight data-icon="inline-end" />
              </a>
            </div>
            <LottieAnimation
              src="/animations/delivery.lottie"
              label="Delivery van driving through the city"
              className="mx-auto max-w-sm"
            />
          </div>
        </section>

        <section className="mx-auto max-w-7xl space-y-8 px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading
            title="Delivery options"
            description="Choose at checkout — every option comes with full tracking."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {shippingMethods.map((method) => {
              const Icon = methodIcons[method.id]
              return (
                <Card key={method.id} aria-labelledby={`method-${method.id}`} role="article">
                  <CardHeader>
                    <span className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted">
                      <Icon className="size-5" />
                    </span>
                    <CardTitle id={`method-${method.id}`} className="text-lg">
                      {method.name}
                    </CardTitle>
                    <CardDescription>{method.description}</CardDescription>
                    {method.badge && (
                      <CardAction>
                        <Badge>{method.badge}</Badge>
                      </CardAction>
                    )}
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Badge variant="outline">{method.price === 0 ? "Free" : usd.format(method.price)}</Badge>
                    <Badge variant="outline">{formatDeliveryWindow(method)}</Badge>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>

        <section id="estimate" className="scroll-mt-28 bg-muted/40 py-16 md:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
            <div className="space-y-5">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Free shipping over ${shippingRules.freeThreshold}.
              </h2>
              <p className="text-lg text-muted-foreground">
                Slide to your basket total and pick a delivery method to see what you&apos;d pay and
                how soon it arrives.
              </p>
            </div>
            <ShippingEstimator />
          </div>
        </section>

        <section className="mx-auto max-w-7xl space-y-8 px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading
            title="From our warehouse to your door"
            description="You'll know where your parcel is at every step."
          />
          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {trackingSteps.map((step, i) => {
              const Icon = stepIcons[i]
              return (
                <li key={step.title} className="space-y-2">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-background ring-1 ring-foreground/10">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="font-medium">
                    <span className="text-muted-foreground">{i + 1}.</span> {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">{step.text}</p>
                </li>
              )
            })}
          </ol>
        </section>

        <section className="mx-auto max-w-3xl space-y-8 px-4 pb-16 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Plane className="size-6 text-muted-foreground" />
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Where we ship</h2>
          </div>
          <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Region</th>
                  <th scope="col" className="px-4 py-3 font-medium">Delivery time</th>
                  <th scope="col" className="px-4 py-3 font-medium">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shippingZones.map((zone) => (
                  <tr key={zone.region}>
                    <th scope="row" className="px-4 py-3 font-medium">{zone.region}</th>
                    <td className="px-4 py-3 text-muted-foreground">{zone.time}</td>
                    <td className="px-4 py-3 tabular-nums">{zone.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mx-auto max-w-3xl space-y-8 px-4 pb-16 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Frequently asked questions</h2>
          <div className="divide-y rounded-xl ring-1 ring-foreground/10">
            {shippingFaqs.map((faq) => (
              <details key={faq.question} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                  {faq.question}
                  <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm text-muted-foreground">{faq.answer}</p>
              </details>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Need a hand with an order?{" "}
            <Link href="/help/contact" className="font-medium text-foreground underline-offset-4 hover:underline">
              Contact our support team
            </Link>{" "}
            — or read about{" "}
            <Link href="/help/returns" className="font-medium text-foreground underline-offset-4 hover:underline">
              returns
            </Link>
            .
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
