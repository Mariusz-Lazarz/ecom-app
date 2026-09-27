import { NextResponse, type NextRequest } from "next/server"

import { logger } from "@/lib/logger"

const log = logger.child({ scope: "http" })

// Logs every incoming request and tags it with an id. The id is forwarded to the app (Route
// Handlers pick it up for their own logs) and returned to the client as `x-request-id`.
export function proxy(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID()
  const { pathname, search } = request.nextUrl

  log.info(`${request.method} ${pathname}${search}`, {
    requestId,
    ip: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  const headers = new Headers(request.headers)
  headers.set("x-request-id", requestId)
  const response = NextResponse.next({ request: { headers } })
  response.headers.set("x-request-id", requestId)
  return response
}

export const config = {
  // Skip build assets, images and other static files, otherwise every page load logs dozens of lines.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|lottie|json|wasm)$).*)"],
}
