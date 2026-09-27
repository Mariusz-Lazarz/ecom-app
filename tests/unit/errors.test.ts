import { describe, expect, it, vi } from "vitest"

import {
  AppError,
  ConflictError,
  GENERIC_MESSAGE,
  logError,
  NotFoundError,
  ServiceUnavailableError,
  toErrorBody,
  ValidationError,
} from "@/lib/errors"

describe("toErrorBody", () => {
  it("exposes status, code and message of known errors", () => {
    expect(toErrorBody(new NotFoundError("Product not found"))).toEqual({
      status: 404,
      body: { error: { code: "not_found", message: "Product not found" } },
    })
  })

  it("includes field errors for validation failures", () => {
    const { status, body } = toErrorBody(new ValidationError({ email: ["Invalid email"] }))
    expect(status).toBe(422)
    expect(body.error.details).toEqual({ fieldErrors: { email: ["Invalid email"] } })
  })

  it("hides the message of unexpected errors", () => {
    expect(toErrorBody(new Error("password=hunter2 leaked in SQL"))).toEqual({
      status: 500,
      body: { error: { code: "internal_error", message: GENERIC_MESSAGE } },
    })
  })

  it("keeps subclass identity and names", () => {
    const err = new ConflictError()
    expect(err).toBeInstanceOf(AppError)
    expect(err.name).toBe("ConflictError")
  })
})

describe("logError", () => {
  it("warns about client errors and logs server errors in full", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    logError(new NotFoundError(), "test")
    expect(error).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)

    logError(new ServiceUnavailableError(), "test")
    logError(new Error("boom"), "test")
    expect(error).toHaveBeenCalledTimes(2)
    expect(String(error.mock.calls[1][0])).toContain("boom")
    vi.restoreAllMocks()
  })
})
