import { CategoriesSection } from "@/components/home/categories-section"
import { FeatureHighlights } from "@/components/home/feature-highlights"
import { FeaturedProducts } from "@/components/home/featured-products"
import { Hero } from "@/components/home/hero"
import { Newsletter } from "@/components/home/newsletter"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <CategoriesSection />
        <FeaturedProducts />
        <FeatureHighlights />
        <Newsletter />
      </main>
      <SiteFooter />
    </>
  )
}
