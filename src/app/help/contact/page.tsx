import type { Metadata } from "next"
import Link from "next/link"
import { Clock, CreditCard, MessageCircle, RotateCcw, Truck } from "lucide-react"

import { auth } from "@/auth"
import { ContactForm } from "@/components/contact/contact-form"
import { HelpNav } from "@/components/help/help-nav"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CONTACT_TOPICS, type ContactTopic } from "@/lib/validation/contact"

export const metadata: Metadata = {
  title: "Contact us — Northcart",
  description: "Questions about an order, a return or a product? Send us a message and a person will reply within one business day.",
}

const shortcuts = [
  { href: "/help/shipping", label: "Where's my order?", text: "Delivery times and tracking", icon: Truck },
  { href: "/help/returns", label: "Returns & refunds", text: "30-day free returns", icon: RotateCcw },
  { href: "/help/payments", label: "Payments", text: "Cards, wallets and Pay-in-4", icon: CreditCard },
]

/**
 * The contact form, prefilled with a signed-in user's name and email. `?topic=` (one of the
 * contact topics) preselects the topic, e.g. from the returns page.
 */
export default async function ContactPage({ searchParams }: PageProps<"/help/contact">) {
  const [session, params] = await Promise.all([auth(), searchParams])
  const user = session?.user
  const topic = CONTACT_TOPICS.find((t) => t.value === params.topic)?.value as ContactTopic | undefined

  return (
    <>
      <SiteHeader />
      <HelpNav />
      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,var(--color-muted),transparent_60%)]" />
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-[2fr_3fr] lg:px-8">
            <div className="space-y-6">
              <Badge variant="secondary" className="gap-1">
                <MessageCircle /> We&apos;re here to help
              </Badge>
              <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Contact us</h1>
              <p className="max-w-lg text-lg text-muted-foreground">
                Questions about an order, a return or a product? Send us a message and a real person will get back
                to you by email.
              </p>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock aria-hidden className="size-4" /> We usually reply within one business day.
              </p>
              <div className="space-y-3">
                <h2 className="text-sm font-semibold">Quick answers</h2>
                <ul className="space-y-2">
                  {shortcuts.map(({ href, label, text, icon: Icon }) => (
                    <li key={href}>
                      <Link
                        href={href}
                        className="flex items-center gap-3 rounded-xl p-3 ring-1 ring-foreground/10 transition-colors hover:bg-muted"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Icon aria-hidden className="size-4" />
                        </span>
                        <span>
                          <span className="block text-sm font-medium">{label}</span>
                          <span className="block text-xs text-muted-foreground">{text}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <Card className="[--card-spacing:--spacing(6)]">
              <CardHeader>
                <CardTitle className="text-xl font-semibold">Send us a message</CardTitle>
                <CardDescription>
                  {user ? "Signed in: we've filled in your details." : "All fields are required unless marked optional."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ContactForm
                  signedIn={Boolean(user)}
                  defaults={{
                    name: user?.name ?? undefined,
                    email: user?.email ?? undefined,
                    topic,
                  }}
                />
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
