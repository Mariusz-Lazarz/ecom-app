export const siteConfig = {
  name: "Northcart",
  tagline: "Everyday goods, thoughtfully picked.",
}

export const navLinks = [
  { href: "/products", label: "Shop all" },
  { href: "/categories", label: "Categories" },
  { href: "/products?sort=newest", label: "New arrivals" },
  { href: "/products?onSale=true", label: "Deals" },
  { href: "/about", label: "About" },
]

// The footer's Shop column. Every slug must exist in the categories table; pages read categories from the database.
export const categories = [
  { slug: "audio", name: "Audio" },
  { slug: "watches", name: "Watches" },
  { slug: "footwear", name: "Footwear" },
  { slug: "cameras", name: "Cameras" },
]
