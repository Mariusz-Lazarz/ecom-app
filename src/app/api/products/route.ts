import * as z from "zod"

import { withErrorHandler } from "@/lib/api/handler"
import { BadRequestError } from "@/lib/errors"
import { listProducts } from "@/lib/products"
import { ProductListQuerySchema, searchParamsToObject } from "@/lib/validation/products"

// GET /api/products?page=&pageSize=&q=&category=&sort=&onSale=&featured=
// An unknown category is not an error: like any other filter, it just matches nothing.
export const GET = withErrorHandler(async (request) => {
  const parsed = ProductListQuerySchema.safeParse(searchParamsToObject(new URL(request.url).searchParams))
  if (!parsed.success) {
    throw new BadRequestError("Invalid query parameters.", { fieldErrors: z.flattenError(parsed.error).fieldErrors })
  }
  return Response.json(await listProducts(parsed.data))
})
