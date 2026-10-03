import type { Metadata } from "next"

import { CategoryGrid } from "@/components/home/categories-section"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { listCategories } from "@/lib/categories"

export const metadata: Metadata = {
  title: "Categories — Northcart",
  description: "Shop Northcart by category.",
}

export default async function CategoriesPage() {
  const categories = await listCategories()

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Categories</h1>
          <p className="text-muted-foreground">Find exactly what you&apos;re looking for.</p>
        </div>
        <CategoryGrid categories={categories} className="mt-8" />
      </main>
      <SiteFooter />
    </>
  )
}
