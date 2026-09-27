import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { SectionHeading } from "@/components/home/section-heading"
import { categories } from "@/lib/data"

export function CategoriesSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <SectionHeading
        title="Shop by category"
        description="Find exactly what you're looking for."
        href="/categories"
        linkLabel="All categories"
      />
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {categories.map(({ slug, name, count, icon: Icon }) => (
          <Link
            key={slug}
            href={`/categories/${slug}`}
            className="group flex flex-col items-center gap-3 rounded-xl border bg-card p-6 text-center transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-muted transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <Icon className="size-5" />
            </span>
            <span className="font-medium">{name}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {count} products
              <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
