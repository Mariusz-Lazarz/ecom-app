import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"

type PageHeroProps = {
  badge: ReactNode
  title: string
  description: ReactNode
  children?: ReactNode
  // Shown beside the text from `lg` up (below it on smaller screens), e.g. an illustration.
  aside?: ReactNode
}

/** The heading block of the content pages (about, careers, help…), in the style of the help pages' heroes. */
export function PageHero({ badge, title, description, children, aside }: PageHeroProps) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,var(--color-muted),transparent_60%)]" />
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-2 lg:px-8">
        <div className="space-y-6">
          <Badge variant="secondary" className="gap-1">
            {badge}
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{title}</h1>
          <div className="max-w-lg text-lg text-muted-foreground">{description}</div>
          {children}
        </div>
        {aside}
      </div>
    </section>
  )
}
