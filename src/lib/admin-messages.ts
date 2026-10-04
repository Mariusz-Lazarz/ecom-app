import {
  AdminMessageListQuerySchema,
  DEFAULT_ADMIN_MESSAGES_PAGE_SIZE,
  type AdminMessageListQuery,
} from "@/lib/validation/contact"
import {
  AdminSubscriberListQuerySchema,
  DEFAULT_ADMIN_SUBSCRIBERS_PAGE_SIZE,
  type AdminSubscriberListQuery,
} from "@/lib/validation/newsletter"

/**
 * URL helpers for the admin message and newsletter lists (client-safe). Parsers drop the params
 * that fail validation, so a bad link falls back to the defaults; `…Href` builders leave defaults out.
 */

type SearchParams = Record<string, string | string[] | undefined>

export const ADMIN_MESSAGES_PATH = "/admin/messages"
export const ADMIN_NEWSLETTER_PATH = "/admin/newsletter"
export const NEWSLETTER_EXPORT_PATH = "/api/admin/newsletter/export"

export const adminMessageHref = (id: string) => `${ADMIN_MESSAGES_PATH}/${id}`

function parseLeniently<T>(schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[] }[] } } }, searchParams: SearchParams): T {
  const input: Record<string, unknown> = { ...searchParams }
  let result = schema.safeParse(input)
  if (!result.success) {
    for (const issue of result.error.issues) delete input[String(issue.path[0])]
    result = schema.safeParse(input)
  }
  if (result.success) return result.data
  const defaults = schema.safeParse({})
  if (!defaults.success) throw new Error("The list query schema has no valid defaults")
  return defaults.data
}

export function parseAdminMessageQuery(searchParams: SearchParams): AdminMessageListQuery {
  const { status, q, page, pageSize } = parseLeniently(AdminMessageListQuerySchema, searchParams)
  return { status, q, page, pageSize }
}

export function adminMessagesHref(query: Partial<AdminMessageListQuery> = {}) {
  const params = new URLSearchParams()
  if (query.status) params.set("status", query.status)
  if (query.q) params.set("q", query.q)
  if (query.pageSize && query.pageSize !== DEFAULT_ADMIN_MESSAGES_PAGE_SIZE) params.set("pageSize", String(query.pageSize))
  if (query.page && query.page > 1) params.set("page", String(query.page))
  const search = params.toString()
  return search ? `${ADMIN_MESSAGES_PATH}?${search}` : ADMIN_MESSAGES_PATH
}

export function parseAdminSubscriberQuery(searchParams: SearchParams): AdminSubscriberListQuery {
  const { status, q, page, pageSize } = parseLeniently(AdminSubscriberListQuerySchema, searchParams)
  return { status, q, page, pageSize }
}

export function adminSubscribersHref(query: Partial<AdminSubscriberListQuery> = {}) {
  const params = new URLSearchParams()
  if (query.status) params.set("status", query.status)
  if (query.q) params.set("q", query.q)
  if (query.pageSize && query.pageSize !== DEFAULT_ADMIN_SUBSCRIBERS_PAGE_SIZE) params.set("pageSize", String(query.pageSize))
  if (query.page && query.page > 1) params.set("page", String(query.page))
  const search = params.toString()
  return search ? `${ADMIN_NEWSLETTER_PATH}?${search}` : ADMIN_NEWSLETTER_PATH
}
