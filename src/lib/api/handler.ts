import "server-only"

import { unstable_rethrow } from "next/navigation"
import * as z from "zod"

import { logError, toErrorBody, ValidationError } from "@/lib/errors"

// Wrap every Route Handler with this so they can just `throw` and still answer with a consistent
// JSON shape: { error: { code, message, details? } }.
export function withErrorHandler<Ctx>(handler: (request: Request, ctx: Ctx) => Promise<Response>) {
  return async (request: Request, ctx: Ctx): Promise<Response> => {
    try {
      return await handler(request, ctx)
    } catch (err) {
      // notFound(), redirect() etc. work by throwing; Next.js has to see those.
      unstable_rethrow(err)

      const normalized = err instanceof z.ZodError ? new ValidationError(z.flattenError(err).fieldErrors) : err
      logError(normalized, `${request.method} ${new URL(request.url).pathname}`)
      const { status, body } = toErrorBody(normalized)
      return Response.json(body, { status })
    }
  }
}
