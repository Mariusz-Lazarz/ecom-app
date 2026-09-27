import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import * as z from "zod"

import { logger } from "@/lib/logger"
import { findUserByEmail, verifyPassword } from "@/lib/users"

const log = logger.child({ scope: "auth" })

const CredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
})

// Registration lives in a Server Action (src/app/actions/register.ts); Auth.js owns sessions.
// There's no login screen yet, but the Credentials provider is ready for one.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  // Send Auth.js' own diagnostics through our logger instead of its default console output.
  logger: {
    error: (err) => log.error(err.message, { err }),
    warn: (code) => log.warn(`Auth.js warning: ${code}`),
    debug: (message, metadata) => log.debug(message, { metadata }),
  },
  events: {
    signIn: ({ user }) => log.info("Signed in", { userId: user.id }),
    signOut: () => log.info("Signed out"),
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = CredentialsSchema.safeParse(credentials)
        if (!parsed.success) {
          log.warn("Sign-in rejected: malformed credentials")
          return null
        }

        const user = await findUserByEmail(parsed.data.email)
        if (!user || !(await verifyPassword(parsed.data.password, user.password_hash))) {
          log.warn("Sign-in rejected: wrong email or password", { email: parsed.data.email })
          return null
        }

        return { id: user.id, email: user.email, name: `${user.first_name} ${user.last_name}` }
      },
    }),
  ],
})
