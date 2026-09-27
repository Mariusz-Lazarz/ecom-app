export const siteConfig = {
  name: "Northcart",
  tagline: "Everyday goods, thoughtfully picked.",
}

export const navLinks = [
  { href: "/products", label: "Shop all" },
  { href: "/categories", label: "Categories" },
  { href: "/new-arrivals", label: "New arrivals" },
  { href: "/deals", label: "Deals" },
  { href: "/about", label: "About" },
]

// Only the footer links still use this; the homepage reads categories from the database.
export const categories = [
  { slug: "audio", name: "Audio" },
  { slug: "watches", name: "Watches" },
  { slug: "footwear", name: "Footwear" },
  { slug: "cameras", name: "Cameras" },
]

export type Product = {
  slug: string
  name: string
  category: string
  price: number
  compareAt?: number
  rating: number
  reviews: number
  image: string
  badge?: string
}

const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}?w=600&q=80&auto=format&fit=crop`

export const featuredProducts: Product[] = [
  {
    slug: "minimal-analog-watch",
    name: "Minimal Analog Watch",
    category: "Watches",
    price: 149,
    rating: 4.8,
    reviews: 212,
    image: unsplash("1523275335684-37898b6baf30"),
    badge: "Bestseller",
  },
  {
    slug: "studio-wireless-headphones",
    name: "Studio Wireless Headphones",
    category: "Audio",
    price: 199,
    compareAt: 249,
    rating: 4.7,
    reviews: 489,
    image: unsplash("1505740420928-5e560c06d30e"),
    badge: "-20%",
  },
  {
    slug: "runner-sneakers-red",
    name: "Runner Sneakers — Red",
    category: "Footwear",
    price: 119,
    rating: 4.6,
    reviews: 158,
    image: unsplash("1542291026-7eec264c27ff"),
  },
  {
    slug: "instant-film-camera",
    name: "Instant Film Camera",
    category: "Cameras",
    price: 89,
    rating: 4.9,
    reviews: 97,
    image: unsplash("1526170375885-4d8ecf77b99f"),
    badge: "New",
  },
]
