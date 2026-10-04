import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  Ban,
  BadgeDollarSign,
  CalendarDays,
  MessageCircle,
  PackageOpen,
  Printer,
  Repeat,
  RotateCcw,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import { PageHero } from "@/components/content/page-hero"
import { HelpNav } from "@/components/help/help-nav"
import { SectionHeading } from "@/components/home/section-heading"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { nonReturnable, returnFaqs, returnHighlights, returnPolicy, returnSteps } from "@/lib/returns"

export const metadata: Metadata = {
  title: "Returns & refunds — Northcart",
  description: `${returnPolicy.windowDays}-day free returns: prepaid label, refunds within ${returnPolicy.refundBusinessDays} business days, easy exchanges.`,
}

// Same order as returnHighlights
const highlightIcons: LucideIcon[] = [CalendarDays, Truck, BadgeDollarSign, Repeat]
// Same order as returnSteps
const stepIcons: LucideIcon[] = [MessageCircle, PackageOpen, Printer, Wallet]

const START_RETURN_HREF = "/help/contact?topic=returns"

export default function ReturnsPage() {
  return (
    <>
      <SiteHeader />
      <HelpNav />
      <main className="flex-1">
        <PageHero
          badge={
            <>
              <RotateCcw /> {returnPolicy.windowDays}-day free returns
            </>
          }
          title="Returns & refunds"
          description={
            <p>
              Not quite right? Send it back within {returnPolicy.windowDays} days of delivery, free of charge.
              We&apos;ll refund you within {returnPolicy.refundBusinessDays} business days of getting it back.
            </p>
          }
          aside={
            <div className="grid gap-4 sm:grid-cols-2">
              {returnHighlights.map((item, i) => {
                const Icon = highlightIcons[i]
                return (
                  <Card key={item.title} size="sm">
                    <CardHeader>
                      <span className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted">
                        <Icon aria-hidden className="size-5" />
                      </span>
                      <CardTitle>{item.title}</CardTitle>
                      <CardDescription>{item.text}</CardDescription>
                    </CardHeader>
                  </Card>
                )
              })}
            </div>
          }
        >
          <Link href={START_RETURN_HREF} className={buttonVariants({ size: "lg", className: "h-11 px-5" })}>
            Start a return <ArrowRight data-icon="inline-end" />
          </Link>
        </PageHero>

        <section className="bg-muted/40 py-16">
          <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8">
            <SectionHeading title="How to return an item" description="Four steps, and no cost to you." />
            <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {returnSteps.map((step, i) => {
                const Icon = stepIcons[i]
                return (
                  <li key={step.title} className="space-y-2">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-background ring-1 ring-foreground/10">
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <h3 className="font-medium">
                      <span className="text-muted-foreground">{i + 1}.</span> {step.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">{step.text}</p>
                  </li>
                )
              })}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-3xl space-y-6 px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Ban aria-hidden className="size-6 text-muted-foreground" />
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">What we can&apos;t take back</h2>
          </div>
          <ul className="space-y-3 rounded-xl p-5 ring-1 ring-foreground/10">
            {nonReturnable.map((item) => (
              <li key={item} className="flex gap-3 text-sm text-muted-foreground">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                {item}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            Faulty or damaged items are always covered, whatever they are: tell us and we&apos;ll put it right.
          </p>
        </section>

        <section className="mx-auto max-w-3xl space-y-6 px-4 pb-16 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Frequently asked questions</h2>
          <Accordion className="rounded-xl px-5 ring-1 ring-foreground/10">
            {returnFaqs.map((faq) => (
              <AccordionItem key={faq.question} value={faq.question}>
                <AccordionTrigger className="py-4 text-base">{faq.question}</AccordionTrigger>
                <AccordionContent className="pb-4 text-muted-foreground">
                  <p>{faq.answer}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <p className="text-sm text-muted-foreground">
            Still have a question?{" "}
            <Link href={START_RETURN_HREF} className="font-medium text-foreground underline-offset-4 hover:underline">
              Contact our support team
            </Link>{" "}
            — or read about{" "}
            <Link href="/help/shipping" className="font-medium text-foreground underline-offset-4 hover:underline">
              shipping
            </Link>
            .
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
