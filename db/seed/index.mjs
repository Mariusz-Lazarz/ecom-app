import { seedAdmin } from "./admin.mjs"
import { seedProducts } from "./products.mjs"

// Run in order by scripts/db-seed.mjs. Each step takes a connected pg client, must be
// idempotent, and returns a short summary of what it seeded.
export const steps = [
  { name: "admin", run: seedAdmin },
  { name: "products", run: seedProducts },
]
