import type { ReactNode } from "react"

import { Prose } from "@/components/content/prose"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"

type PolicyPageProps = {
  title: string
  updated: string
  intro: ReactNode
  // In-page links to the page's sections, shown beside the text from `lg` up.
  sections: { id: string; title: string }[]
  children: ReactNode
}

/** The layout of the legal pages (privacy, terms): a title block, then the text with a contents list. */
export function PolicyPage({ title, updated, intro, sections, children }: PolicyPageProps) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="border-b bg-muted/40">
          <div className="mx-auto max-w-7xl space-y-4 px-4 py-12 sm:px-6 md:py-16 lg:px-8">
            <p className="text-sm text-muted-foreground">Last updated {updated}</p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{title}</h1>
            <div className="max-w-2xl text-lg text-muted-foreground">{intro}</div>
          </div>
        </section>
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_14rem] lg:px-8">
          <Prose>{children}</Prose>
          <nav aria-label="On this page" className="order-first lg:order-last">
            <div className="space-y-2 rounded-xl p-4 text-sm ring-1 ring-foreground/10 lg:sticky lg:top-24">
              <p className="font-semibold">On this page</p>
              <ol className="space-y-1.5">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`} className="text-muted-foreground hover:text-foreground hover:underline">
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
