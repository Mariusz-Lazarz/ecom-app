import * as z from "zod"

export const RegisterSchema = z
  .object({
    firstName: z.string().trim().min(1, { error: "First name is required." }).max(50),
    lastName: z.string().trim().min(1, { error: "Last name is required." }).max(50),
    email: z.string().trim().toLowerCase().pipe(z.email({ error: "Please enter a valid email." })),
    password: z
      .string()
      .min(8, { error: "Be at least 8 characters long." })
      // bcrypt only looks at the first 72 bytes, anything longer would be silently ignored.
      .max(72, { error: "Be at most 72 characters long." })
      .regex(/[a-zA-Z]/, { error: "Contain at least one letter." })
      .regex(/[0-9]/, { error: "Contain at least one number." }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Passwords don't match.",
    path: ["confirmPassword"],
  })

export type RegisterInput = z.infer<typeof RegisterSchema>

export type RegisterFormState =
  | {
      success?: false
      errors?: Partial<Record<keyof RegisterInput, string[]>>
      message?: string
      values?: Partial<Pick<RegisterInput, "firstName" | "lastName" | "email">>
    }
  | { success: true; firstName: string }
  | undefined
