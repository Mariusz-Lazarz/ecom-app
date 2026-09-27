import { describe, expect, it } from "vitest"

import { RegisterSchema } from "@/lib/validation/register"

const valid = {
  firstName: " Jan ",
  lastName: "Kowalski",
  email: " Jan@Example.COM ",
  password: "secret123",
  confirmPassword: "secret123",
}

describe("RegisterSchema", () => {
  it("accepts valid input and normalizes names and email", () => {
    const result = RegisterSchema.parse(valid)
    expect(result.firstName).toBe("Jan")
    expect(result.email).toBe("jan@example.com")
  })

  it("rejects weak passwords with every failed rule", () => {
    const result = RegisterSchema.safeParse({ ...valid, password: "abc", confirmPassword: "abc" })
    expect(result.success).toBe(false)
    const messages = result.error!.issues.filter((i) => i.path[0] === "password").map((i) => i.message)
    expect(messages).toEqual(["Be at least 8 characters long.", "Contain at least one number."])
  })

  it("rejects mismatched password confirmation", () => {
    const result = RegisterSchema.safeParse({ ...valid, confirmPassword: "different1" })
    expect(result.error?.issues[0].path).toEqual(["confirmPassword"])
  })

  it("rejects invalid email and empty names", () => {
    const result = RegisterSchema.safeParse({ ...valid, email: "nope", firstName: " " })
    const paths = result.error!.issues.map((i) => i.path[0])
    expect(paths).toEqual(expect.arrayContaining(["email", "firstName"]))
  })
})
