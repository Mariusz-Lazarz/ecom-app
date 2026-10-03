import { withErrorHandler } from "@/lib/api/handler"
import { NotFoundError } from "@/lib/errors"
import { getProductBySlug } from "@/lib/products"

export const GET = withErrorHandler<RouteContext<"/api/products/[slug]">>(async (_request, ctx) => {
  const { slug } = await ctx.params
  const product = await getProductBySlug(slug)
  if (!product) throw new NotFoundError("Product not found.")
  return Response.json({ product })
})
