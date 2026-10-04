import type { Metadata } from "next"
import Link from "next/link"
import { Briefcase, Clock, Info, MapPin } from "lucide-react"

import { PageHero } from "@/components/content/page-hero"
import { SectionHeading } from "@/components/home/section-heading"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { siteConfig } from "@/lib/data"

export const metadata: Metadata = {
  title: "Careers — Northcart",
  description: `Open roles at ${siteConfig.name}. A demo store: the positions are made up.`,
}

const roles = [
  {
    title: "Senior Frontend Engineer",
    team: "Engineering",
    location: "Remote (Europe)",
    type: "Full-time",
    text: "Own the storefront: React Server Components, accessible UI and pages that load before you blink.",
  },
  {
    title: "Product Buyer, Audio & Tech",
    team: "Merchandising",
    location: "Warszawa",
    type: "Full-time",
    text: "Test dozens of headphones and speakers a month, pick the few worth selling and negotiate with brands.",
  },
  {
    title: "Customer Care Specialist",
    team: "Support",
    location: "Remote (UK or EU)",
    type: "Part-time",
    text: "Answer customers by email, sort out returns and turn the common questions into better help pages.",
  },
  {
    title: "Warehouse Lead",
    team: "Operations",
    location: "San Francisco",
    type: "Full-time",
    text: "Run same-day dispatch, keep stock counts honest and make every parcel look like a gift.",
  },
]

const perks = [
  "A four-day week in July and August",
  "€1,000 a year to spend on learning",
  "Staff discount on everything we sell",
  "Work from anywhere for a month each year",
]

export default function CareersPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <PageHero
          badge={
            <>
              <Briefcase /> We&apos;re hiring
            </>
          }
          title="Help us pick better things"
          description={
            <p>
              We&apos;re a small team that ships fast and cares about the details. If you like well-made things
              and the people who buy them, you&apos;ll fit right in.
            </p>
          }
          aside={
            <Card className="lg:ml-auto lg:max-w-sm">
              <CardHeader>
                <CardTitle className="text-lg">Perks</CardTitle>
                <CardDescription>On top of a fair salary and proper holidays.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {perks.map((perk) => (
                    <li key={perk} className="flex gap-2">
                      <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                      {perk}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          }
        />

        <section className="mx-auto max-w-7xl space-y-8 px-4 pb-16 sm:px-6 lg:px-8">
          <SectionHeading title="Open roles" description={`${roles.length} positions across the company.`} />
          <Alert>
            <Info />
            <AlertTitle>No real positions: this is a demo store</AlertTitle>
            <AlertDescription>
              {siteConfig.name} is a practice project, so these roles are made up and there&apos;s nowhere to
              apply. Thanks for looking, though!
            </AlertDescription>
          </Alert>
          <ul className="grid gap-4 md:grid-cols-2">
            {roles.map((role, i) => (
              <li key={role.title}>
                <Card className="h-full" role="article" aria-labelledby={`role-${i}`}>
                  <CardHeader>
                    <Badge variant="secondary" className="mb-1">
                      {role.team}
                    </Badge>
                    <CardTitle id={`role-${i}`} className="text-lg">
                      {role.title}
                    </CardTitle>
                    <CardDescription>{role.text}</CardDescription>
                  </CardHeader>
                  <CardFooter className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <MapPin aria-hidden className="size-4" /> {role.location}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock aria-hidden className="size-4" /> {role.type}
                    </span>
                  </CardFooter>
                </Card>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            Curious about who we are?{" "}
            <Link href="/about" className="font-medium text-foreground underline-offset-4 hover:underline">
              Read our story
            </Link>
            .
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
