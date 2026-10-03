/** The query parameter that carries where to go after signing in, e.g. `/login?callbackUrl=/checkout`. */
export const CALLBACK_PARAM = "callbackUrl"

/**
 * Returns `value` when it's a same-origin path (`/checkout`, `/orders/NC-10001?x=1`), otherwise
 * null. Absolute URLs, protocol-relative ones (`//evil.com`), backslash tricks (`/\evil.com`) and
 * anything with control characters are refused, so a crafted link can't redirect off-site.
 */
export function safeCallbackPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null
  return value
}

/** The login URL that brings the visitor back to `path` (when it's safe) after signing in. */
export function loginHref(path?: string | null): string {
  const target = safeCallbackPath(path)
  return target ? `/login?${CALLBACK_PARAM}=${encodeURIComponent(target)}` : "/login"
}
