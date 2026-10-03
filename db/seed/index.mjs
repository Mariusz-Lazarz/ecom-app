import { seedAdmin } from "./admin.mjs"
import { seedCustomers } from "./customer.mjs"
import { seedOrders } from "./orders.mjs"
import { seedProducts } from "./products.mjs"

// Run in order by scripts/db-seed.mjs. Each step takes a connected pg client, must be
// idempotent, and returns a short summary of what it seeded. `orders` needs the steps before it.
export const steps = [
  { name: "admin", run: seedAdmin },
  { name: "customers", run: seedCustomers },
  { name: "products", run: seedProducts },
  { name: "orders", run: seedOrders },
]
