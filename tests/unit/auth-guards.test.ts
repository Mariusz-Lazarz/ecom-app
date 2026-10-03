import { beforeEach, describe, expect, it, vi } from "vitest"

const auth = vi.fn()
const redirect = vi.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` })
})
const notFound = vi.fn(() => {
  throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" })
})

vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: () => auth() }))
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url), notFound: () => notFound() }))

const { requireAdmin, requireUser } = await import("@/lib/auth-guards")

const session = (role: "user" | "admin") => ({
  user: { id: "u1", name: "Jan Kowalski", email: "jan@example.com", role },
  expires: "2099-01-01T00:00:00.000Z",
})

describe("auth guards", () => {
  beforeEach(() => {
    auth.mockReset()
    redirect.mockClear()
    notFound.mockClear()
  })

  describe("requireUser", () => {
    it("returns the session of a signed-in user", async () => {
      const current = session("user")
      auth.mockResolvedValue(current)

      await expect(requireUser()).resolves.toBe(current)
      expect(redirect).not.toHaveBeenCalled()
    })

    it("redirects signed-out visitors to /login", async () => {
      auth.mockResolvedValue(null)

      await expect(requireUser()).rejects.toMatchObject({ digest: "NEXT_REDIRECT;replace;/login;307;" })
      expect(redirect).toHaveBeenCalledExactlyOnceWith("/login")
    })

    it("redirects when the session has no user", async () => {
      auth.mockResolvedValue({ expires: "2099-01-01T00:00:00.000Z" })

      await expect(requireUser()).rejects.toMatchObject({ message: "NEXT_REDIRECT" })
      expect(redirect).toHaveBeenCalledExactlyOnceWith("/login")
    })
  })

  describe("requireAdmin", () => {
    it("returns the session of an admin", async () => {
      const current = session("admin")
      auth.mockResolvedValue(current)

      await expect(requireAdmin()).resolves.toBe(current)
      expect(notFound).not.toHaveBeenCalled()
      expect(redirect).not.toHaveBeenCalled()
    })

    it("responds 404 to a signed-in non-admin", async () => {
      auth.mockResolvedValue(session("user"))

      await expect(requireAdmin()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })
      expect(notFound).toHaveBeenCalledOnce()
      expect(redirect).not.toHaveBeenCalled()
    })

    it("redirects signed-out visitors to /login instead of a 404", async () => {
      auth.mockResolvedValue(null)

      await expect(requireAdmin()).rejects.toMatchObject({ digest: "NEXT_REDIRECT;replace;/login;307;" })
      expect(redirect).toHaveBeenCalledExactlyOnceWith("/login")
      expect(notFound).not.toHaveBeenCalled()
    })
  })
})
