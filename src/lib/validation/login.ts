import * as z from "zod"

// Only checks the shape; the real check is the password hash in src/auth.ts.
export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "Please enter a valid email." })),
  password: z.string().min(1, { error: "Password is required." }),
})

// Deliberately vague: don't reveal whether the email is registered.
export const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password."

export type LoginInput = z.infer<typeof LoginSchema>

export type LoginFormState =
  | {
      errors?: Partial<Record<keyof LoginInput, string[]>>
      message?: string
      values?: Partial<Pick<LoginInput, "email">>
    }
  | undefined
