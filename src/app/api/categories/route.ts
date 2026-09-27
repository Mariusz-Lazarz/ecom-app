import { withErrorHandler } from "@/lib/api/handler"
import { listCategories } from "@/lib/categories"

export const GET = withErrorHandler(async () => {
  return Response.json({ categories: await listCategories() })
})
