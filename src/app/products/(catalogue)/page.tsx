import type { Metadata } from "next"

import { Catalogue } from "@/components/products/catalogue"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { listCategories } from "@/lib/categories"
import { parseCatalogueQuery } from "@/lib/catalogue"
import { listProducts } from "@/lib/products"
import { getWishlistedIds } from "@/lib/wishlist"

export const metadata: Metadata = {
  title: "Shop all products — Northcart",
  description: "Browse the full Northcart catalogue: audio, watches, footwear, cameras, accessories and bags.",
}

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const query = parseCatalogueQuery(await searchParams)
  const [categories, list] = await Promise.all([listCategories(), listProducts(query)])
  const wishlist = await getWishlistedIds(list.items.map((product) => product.id))
  const category = query.category ? categories.find((c) => c.slug === query.category) : undefined

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Catalogue
          basePath="/products"
          title={category?.name ?? (query.onSale ? "Deals" : "All products")}
          description={query.onSale ? "Everything that's on sale right now." : "Everyday goods, thoughtfully picked."}
          query={query}
          activeCategory={query.category}
          categories={categories}
          list={list}
          wishlist={wishlist}
        />
      </main>
      <SiteFooter />
    </>
  )
}
