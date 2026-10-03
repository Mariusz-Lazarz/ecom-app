import { describe, expect, it } from "vitest"

import { loginHref, safeCallbackPath } from "@/lib/safe-redirect"

describe("safeCallbackPath", () => {
  it.each(["/", "/checkout", "/orders/NC-10001", "/products?q=bag&page=2", "/a#b"])("keeps the path %j", (path) => {
    expect(safeCallbackPath(path)).toBe(path)
  })

  it.each([
    ["an absolute URL", "https://evil.example/checkout"],
    ["a protocol-relative URL", "//evil.example"],
    ["a backslash host", "/\\evil.example"],
    ["a backslash later on", "/foo\\bar"],
    ["a relative path", "checkout"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a newline", "/checkout\n"],
    ["a tab", "/\t/evil.example"],
    ["an empty string", ""],
    ["a too-long path", `/${"a".repeat(512)}`],
  ])("refuses %s", (_label, value) => {
    expect(safeCallbackPath(value)).toBeNull()
  })

  it("refuses non-strings", () => {
    expect(safeCallbackPath(undefined)).toBeNull()
    expect(safeCallbackPath(null)).toBeNull()
    expect(safeCallbackPath(["/checkout"])).toBeNull()
  })

  it("accepts a path of exactly 512 characters", () => {
    const path = `/${"a".repeat(511)}`
    expect(safeCallbackPath(path)).toBe(path)
  })
})

describe("loginHref", () => {
  it("encodes a safe path as callbackUrl", () => {
    expect(loginHref("/orders/NC-10001?x=1")).toBe("/login?callbackUrl=%2Forders%2FNC-10001%3Fx%3D1")
  })

  it("is the plain login page without a path or with an unsafe one", () => {
    expect(loginHref()).toBe("/login")
    expect(loginHref(null)).toBe("/login")
    expect(loginHref("//evil.example")).toBe("/login")
  })
})
