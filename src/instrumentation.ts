import type { Instrumentation } from "next"

import { logger } from "@/lib/logger"

const log = logger.child({ scope: "server" })

export function register() {
  log.info("Server starting", {
    runtime: process.env.NEXT_RUNTIME,
    env: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL ?? "default",
  })
}

// Errors Next.js catches itself: Server Components, Server Actions and Route Handlers that don't
// handle them. The digest matches the one shown on the error page.
export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined
  log.error(`Unhandled error in ${context.routeType} ${request.method} ${request.path}`, {
    err,
    digest,
    routePath: context.routePath,
    renderSource: context.renderSource,
  })
}
