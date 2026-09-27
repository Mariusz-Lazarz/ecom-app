import "server-only"

import { unstable_rethrow } from "next/navigation"
import * as z from "zod"

import { logError, toErrorBody, ValidationError } from "@/lib/errors"
import { logger } from "@/lib/logger"

// Wrap every Route Handler with this so they can just `throw` and still answer with a consistent
// JSON shape: { error: { code, message, details? } }. It also logs each call with its status and
// duration, tagged with the request id set in src/proxy.ts.
export function withErrorHandler<Ctx>(handler: (request: Request, ctx: Ctx) => Promise<Response>) {
  return async (request: Request, ctx: Ctx): Promise<Response> => {
    const started = performance.now()
    const route = `${request.method} ${new URL(request.url).pathname}`
    const log = logger.child({ scope: "api", requestId: request.headers.get("x-request-id") ?? undefined })
    const done = (res: Response) => {
      const durationMs = Math.round(performance.now() - started)
      const level = res.status >= 500 ? "error" : res.status >= 400 ? "warn" : "info"
      log[level](`${route} ${res.status}`, { durationMs })
      return res
    }

    try {
      return done(await handler(request, ctx))
    } catch (err) {
      // notFound(), redirect() etc. work by throwing; Next.js has to see those.
      unstable_rethrow(err)

      const normalized = err instanceof z.ZodError ? new ValidationError(z.flattenError(err).fieldErrors) : err
      logError(normalized, route, log)
      const { status, body } = toErrorBody(normalized)
      return done(Response.json(body, { status }))
    }
  }
}
