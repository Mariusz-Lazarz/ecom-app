import { afterEach, describe, expect, it, vi } from "vitest"

import { logger, serializeError } from "@/lib/logger"

afterEach(() => {
  vi.restoreAllMocks()
})

function lastLine(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.at(-1)!.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ")
}

describe("logger", () => {
  it("drops messages below the configured level (warn in tests)", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    logger.debug("hidden")
    logger.info("hidden")
    expect(log).not.toHaveBeenCalled()
    expect(info).not.toHaveBeenCalled()
  })

  it("writes warnings and errors with their scope and context", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    logger.child({ scope: "db" }).warn("Slow query", { durationMs: 512 })
    const line = lastLine(warn)
    expect(line).toContain("[db]")
    expect(line).toContain("Slow query")
    expect(line).toContain("512")
  })

  it("redacts secrets however deep they are", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    logger.error("oops", { user: { email: "a@b.c", password: "hunter2", passwordHash: "$2b$" }, token: "abc" })
    const line = lastLine(error)
    expect(line).toContain("a@b.c")
    expect(line).not.toContain("hunter2")
    expect(line).not.toContain("$2b$")
    expect(line).not.toContain("abc")
  })

  it("serializes errors with their cause", () => {
    const err = new Error("outer", { cause: Object.assign(new Error("inner"), { code: "ECONNREFUSED" }) })
    expect(serializeError(err)).toMatchObject({
      name: "Error",
      message: "outer",
      cause: { message: "inner", code: "ECONNREFUSED" },
    })
  })

  it("never throws, even on circular context", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => logger.error("circular", { circular })).not.toThrow()
    expect(error).toHaveBeenCalled()
  })
})
