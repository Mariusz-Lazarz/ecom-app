import { describe, expect, it } from "vitest"

import {
  adminMessageHref,
  adminMessagesHref,
  adminSubscribersHref,
  parseAdminMessageQuery,
  parseAdminSubscriberQuery,
} from "@/lib/admin-messages"

describe("admin message list URLs", () => {
  it("defaults to every message, page 1, 20 a page", () => {
    expect(parseAdminMessageQuery({})).toEqual({ status: undefined, q: undefined, page: 1, pageSize: 20 })
  })

  it("reads the status, search and page", () => {
    expect(parseAdminMessageQuery({ status: "new", q: " mug ", page: "3", pageSize: "50" })).toEqual({
      status: "new",
      q: "mug",
      page: 3,
      pageSize: 50,
    })
  })

  it("drops only the invalid params", () => {
    expect(parseAdminMessageQuery({ status: "spam", q: "x".repeat(101), page: "0", pageSize: "500" })).toEqual({
      status: undefined,
      q: undefined,
      page: 1,
      pageSize: 20,
    })
    expect(parseAdminMessageQuery({ status: "archived", page: "abc" })).toMatchObject({ status: "archived", page: 1 })
  })

  it("takes the first value of a repeated param and treats empty ones as unset", () => {
    expect(parseAdminMessageQuery({ status: ["read", "new"], q: "" })).toMatchObject({ status: "read", q: undefined })
  })

  it("builds links leaving the defaults out", () => {
    expect(adminMessagesHref()).toBe("/admin/messages")
    expect(adminMessagesHref({ status: "new", q: "a&b", page: 1, pageSize: 20 })).toBe("/admin/messages?status=new&q=a%26b")
    expect(adminMessagesHref({ page: 2, pageSize: 50 })).toBe("/admin/messages?pageSize=50&page=2")
    expect(adminMessageHref("abc")).toBe("/admin/messages/abc")
  })

  it("round-trips a query through its link", () => {
    const query = { status: "read" as const, q: "late parcel", page: 4, pageSize: 20 }
    const params = Object.fromEntries(new URL(adminMessagesHref(query), "http://x").searchParams)
    expect(parseAdminMessageQuery(params)).toEqual(query)
  })
})

describe("admin newsletter list URLs", () => {
  it("defaults to every subscriber, page 1, 25 a page, and drops invalid params", () => {
    expect(parseAdminSubscriberQuery({})).toEqual({ status: undefined, q: undefined, page: 1, pageSize: 25 })
    expect(parseAdminSubscriberQuery({ status: "pending", page: "2" })).toEqual({
      status: undefined,
      q: undefined,
      page: 2,
      pageSize: 25,
    })
  })

  it("builds links leaving the defaults out", () => {
    expect(adminSubscribersHref()).toBe("/admin/newsletter")
    expect(adminSubscribersHref({ status: "unsubscribed", q: "gmail", page: 2, pageSize: 25 })).toBe(
      "/admin/newsletter?status=unsubscribed&q=gmail&page=2",
    )
  })
})
