import { describe, expect, it } from "vitest"

import { parseNotification } from "@/lib/notifications"

describe("parseNotification", () => {
  it("parses a notification with a description", () => {
    const raw = JSON.stringify({ type: "success", title: "Saved", description: "All good." })
    expect(parseNotification(raw)).toEqual({ type: "success", title: "Saved", description: "All good." })
  })

  it("parses a notification without a description and leaves the key out", () => {
    expect(parseNotification(JSON.stringify({ type: "info", title: "Heads up" }))).toStrictEqual({
      type: "info",
      title: "Heads up",
    })
  })

  it.each(["success", "error", "warning", "info"])("accepts the %s type", (type) => {
    expect(parseNotification(JSON.stringify({ type, title: "t" }))?.type).toBe(type)
  })

  it("drops unknown keys", () => {
    expect(parseNotification(JSON.stringify({ type: "error", title: "Nope", html: "<b>x</b>" }))).toStrictEqual({
      type: "error",
      title: "Nope",
    })
  })

  it.each([
    ["invalid JSON", "{not json"],
    ["an empty string", ""],
    ["null", "null"],
    ["a plain string", '"hello"'],
    ["an array", "[]"],
    ["an unknown type", JSON.stringify({ type: "danger", title: "x" })],
    ["a missing type", JSON.stringify({ title: "x" })],
    ["a missing title", JSON.stringify({ type: "info" })],
    ["an empty title", JSON.stringify({ type: "info", title: "" })],
    ["a non-string title", JSON.stringify({ type: "info", title: 42 })],
    ["a non-string description", JSON.stringify({ type: "info", title: "x", description: 1 })],
  ])("rejects %s", (_label, raw) => {
    expect(parseNotification(raw)).toBeNull()
  })
})
