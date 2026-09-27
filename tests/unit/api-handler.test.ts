import { notFound } from "next/navigation"
import { describe, expect, it, vi } from "vitest"
import * as z from "zod"

vi.mock("server-only", () => ({}))

const { withErrorHandler } = await import("@/lib/api/handler")
const { ConflictError } = await import("@/lib/errors")

const request = () => new Request("http://localhost/api/things", { method: "POST" })

describe("withErrorHandler", () => {
  it("passes successful responses through", async () => {
    const handler = withErrorHandler(async () => Response.json({ ok: true }))
    const res = await handler(request(), {})
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it("maps AppErrors to their status and JSON body", async () => {
    const handler = withErrorHandler(async () => {
      throw new ConflictError("Email taken")
    })
    const res = await handler(request(), {})
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: { code: "conflict", message: "Email taken" } })
  })

  it("turns zod errors into 422 with field errors", async () => {
    const handler = withErrorHandler(async () => {
      z.object({ email: z.email() }).parse({ email: "nope" })
      return Response.json({})
    })
    const res = await handler(request(), {})
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({
      error: { code: "validation_error", details: { fieldErrors: { email: expect.any(Array) } } },
    })
  })

  it("logs unexpected errors and returns a generic 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const handler = withErrorHandler(async () => {
      throw new Error("connection string with secrets")
    })
    const res = await handler(request(), {})
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain("secrets")
    expect(spy).toHaveBeenCalledWith("[POST /api/things]", expect.any(Error))
    spy.mockRestore()
  })

  it("lets Next.js control-flow errors through", async () => {
    const handler = withErrorHandler(async () => notFound())
    await expect(handler(request(), {})).rejects.toThrow()
  })
})
