import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import * as z from "zod"

import { findUserByEmail, verifyPassword } from "@/lib/users"

const CredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
})

// Registration lives in a Server Action (src/app/actions/register.ts); Auth.js owns sessions.
// There's no login screen yet, but the Credentials provider is ready for one.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = CredentialsSchema.safeParse(credentials)
        if (!parsed.success) return null

        const user = await findUserByEmail(parsed.data.email)
        if (!user || !(await verifyPassword(parsed.data.password, user.password_hash))) return null

        return { id: user.id, email: user.email, name: `${user.first_name} ${user.last_name}` }
      },
    }),
  ],
})
