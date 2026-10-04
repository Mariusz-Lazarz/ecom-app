import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { LinkIcon, MailX } from "lucide-react"

import { UnsubscribeForm } from "@/components/newsletter/unsubscribe-form"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { findSubscriberByToken } from "@/lib/newsletter"
import { INVALID_UNSUBSCRIBE_LINK_MESSAGE, UnsubscribeTokenSchema } from "@/lib/validation/newsletter"

export const metadata: Metadata = {
  title: "Unsubscribe — Northcart",
  robots: { index: false },
}

/**
 * Where the newsletter email's unsubscribe link (`?token=…`) lands. It asks for one click to
 * confirm (so link scanners that open every URL in an email don't unsubscribe anyone), says so when
 * the address is already off the list, or explains that the link doesn't work.
 */
export default async function UnsubscribePage({ searchParams }: PageProps<"/newsletter/unsubscribe">) {
  await connection()
  const { token } = await searchParams
  const parsed = UnsubscribeTokenSchema.safeParse(token)
  const subscriber = parsed.success ? await findSubscriberByToken(parsed.data) : null

  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-16">
        <Card className="w-full max-w-md [--card-spacing:--spacing(6)]">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold tracking-tight">Newsletter</CardTitle>
            <CardDescription>Manage your Northcart email subscription.</CardDescription>
          </CardHeader>
          <CardContent>
            {!subscriber ? (
              <div role="alert" className="flex flex-col items-center gap-3 py-4 text-center">
                <LinkIcon aria-hidden className="size-10 text-muted-foreground" />
                <h2 className="text-lg font-semibold">This link doesn&apos;t work</h2>
                <p className="text-sm text-muted-foreground">{INVALID_UNSUBSCRIBE_LINK_MESSAGE}</p>
                <Link href="/help/contact" className={buttonVariants({ variant: "outline", className: "mt-2 h-10 px-4" })}>
                  Contact us
                </Link>
              </div>
            ) : subscriber.status === "unsubscribed" ? (
              <div role="status" className="flex flex-col items-center gap-3 py-4 text-center">
                <MailX aria-hidden className="size-10 text-muted-foreground" />
                <h2 className="text-lg font-semibold">You&apos;re already unsubscribed</h2>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium break-all text-foreground">{subscriber.email}</span> won&apos;t get
                  any more newsletters from us.
                </p>
                <Link href="/" className={buttonVariants({ className: "mt-2 h-10 px-4" })}>
                  Back to the store
                </Link>
              </div>
            ) : (
              <UnsubscribeForm token={parsed.data!} email={subscriber.email} />
            )}
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </>
  )
}
