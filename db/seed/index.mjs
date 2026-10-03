import { seedAddresses } from "./addresses.mjs"
import { seedAdmin } from "./admin.mjs"
import { seedCustomers } from "./customer.mjs"
import { seedDiscounts } from "./discounts.mjs"
import { seedOrders } from "./orders.mjs"
import { seedProducts } from "./products.mjs"
import { seedReviews } from "./reviews.mjs"

// Run in order by scripts/db-seed.mjs. Each step takes a connected pg client, must be
// idempotent, and returns a short summary of what it seeded. `orders` needs the steps before it,
// `reviews` needs `orders` (customer reviews are checked against delivered orders), and
// `addresses` needs the admin and customers.
export const steps = [
  { name: "admin", run: seedAdmin },
  { name: "customers", run: seedCustomers },
  { name: "products", run: seedProducts },
  { name: "orders", run: seedOrders },
  { name: "reviews", run: seedReviews },
  { name: "discounts", run: seedDiscounts },
  { name: "addresses", run: seedAddresses },
]
