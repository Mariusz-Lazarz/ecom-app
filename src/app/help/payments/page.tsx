import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  ChevronDown,
  CreditCard,
  Gift,
  KeyRound,
  Lock,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react"

import { SectionHeading } from "@/components/home/section-heading"
import { LottieAnimation } from "@/components/lottie-animation"
import { InstalmentCalculator } from "@/components/payments/instalment-calculator"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { payLater, paymentFaqs, paymentMethods, securityPoints } from "@/lib/payments"

export const metadata: Metadata = {
  title: "Payment options — Northcart",
  description: "Pay with cards, Apple Pay, Google Pay, PayPal or split your order into 4 interest-free payments.",
}

const methodIcons: Record<string, LucideIcon> = {
  cards: CreditCard,
  wallets: Smartphone,
  "pay-later": CalendarClock,
  "gift-cards": Gift,
}

// Same order as securityPoints
const securityIcons: LucideIcon[] = [Lock, BadgeCheck, KeyRound, ShieldCheck]

export default function PaymentsPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,var(--color-muted),transparent_60%)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-2 lg:px-8">
            <div className="space-y-6">
              <Badge variant="secondary" className="gap-1">
                <Lock /> Secure checkout
              </Badge>
              <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Payment options
              </h1>
              <p className="max-w-lg text-lg text-muted-foreground">
                Cards, wallets or four interest-free payments — pick whatever suits you. Every
                payment is encrypted and covered by our buyer protection.
              </p>
              <a href="#pay-in-4" className={buttonVariants({ size: "lg", className: "h-11 px-5" })}>
                Try the Pay-in-4 calculator <ArrowRight data-icon="inline-end" />
              </a>
            </div>
            <LottieAnimation
              src="/animations/secure-payment.lottie"
              label="Person completing a secure mobile payment"
              className="mx-auto max-w-sm"
            />
          </div>
        </section>

        <section className="mx-auto max-w-7xl space-y-8 px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading
            title="Ways to pay"
            description="Choose at checkout — you can switch methods on every order."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {paymentMethods.map((method) => {
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
                  <CardContent>
                    <ul aria-label={`${method.name} accepted`} className="flex flex-wrap gap-2">
                      {method.brands.map((brand) => (
                        <li key={brand}>
                          <Badge variant="outline">{brand}</Badge>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>

        <section id="pay-in-4" className="scroll-mt-28 bg-muted/40 py-16 md:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
            <div className="space-y-5">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Split it into {payLater.instalments}, pay no interest.
              </h2>
              <p className="text-lg text-muted-foreground">
                Pay a quarter today and the rest every {payLater.intervalWeeks} weeks. Slide to see
                what your order would cost per payment.
              </p>
            </div>
            <InstalmentCalculator />
          </div>
        </section>

        <section className="mx-auto max-w-7xl space-y-8 px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading
            title="Your payment is safe with us"
            description="The same protection the big banks use, on every single order."
          />
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {securityPoints.map((point, i) => {
              const Icon = securityIcons[i]
              return (
                <li key={point.title} className="space-y-2">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-background ring-1 ring-foreground/10">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="font-medium">{point.title}</h3>
                  <p className="text-sm text-muted-foreground">{point.text}</p>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="mx-auto max-w-3xl space-y-8 px-4 pb-16 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Frequently asked questions</h2>
          <div className="divide-y rounded-xl ring-1 ring-foreground/10">
            {paymentFaqs.map((faq) => (
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
            Still stuck?{" "}
            <Link href="/help/contact" className="font-medium text-foreground underline-offset-4 hover:underline">
              Contact our support team
            </Link>{" "}
            — we usually reply within a few hours.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
