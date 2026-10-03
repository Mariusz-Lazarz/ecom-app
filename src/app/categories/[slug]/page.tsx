import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import { Catalogue } from "@/components/products/catalogue"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { listCategories } from "@/lib/categories"
import { parseCatalogueQuery } from "@/lib/catalogue"
import { listProducts } from "@/lib/products"

// generateMetadata and the page both need the categories; cache() makes that one query per request.
const loadCategories = cache(listCategories)

async function findCategory(slug: string) {
  return (await loadCategories()).find((category) => category.slug === slug)
}

export async function generateMetadata({ params }: PageProps<"/categories/[slug]">): Promise<Metadata> {
  const category = await findCategory((await params).slug)
  return { title: `${category?.name ?? "Category not found"} — Northcart` }
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/categories/[slug]">) {
  const { slug } = await params
  // The route decides the category; a `?category=` in the URL is ignored here.
  const query = { ...parseCatalogueQuery(await searchParams), category: undefined }
  const categories = await loadCategories()
  const category = categories.find((c) => c.slug === slug)
  if (!category) notFound()

  const list = await listProducts({ ...query, category: category.slug })

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Catalogue
          basePath={`/categories/${category.slug}`}
          title={category.name}
          description={`Browse our ${category.name.toLowerCase()} range.`}
          query={query}
          activeCategory={category.slug}
          categories={categories}
          list={list}
        />
      </main>
      <SiteFooter />
    </>
  )
}
