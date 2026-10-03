import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import * as z from "zod"

import { logger } from "@/lib/logger"
import { jwtWithRole, sessionWithRole } from "@/lib/roles"
import { findUserByEmail, findUserById, verifyPassword } from "@/lib/users"

const log = logger.child({ scope: "auth" })

const CredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
})

// Registration and login live in Server Actions (src/app/actions/); Auth.js owns sessions.
// `updateSession` (Auth.js' `unstable_update`) re-reads the signed-in user's name and email into
// the JWT, so profile changes show up without signing in again.
export const {
  handlers,
  auth,
  signIn,
  signOut,
  unstable_update: updateSession,
} = NextAuth({
  session: { strategy: "jwt" },
  // Auth.js only trusts the Host header in dev by default; `next start` (used by e2e) needs this too.
  trustHost: true,
  // Send Auth.js' own diagnostics through our logger instead of its default console output.
  logger: {
    error: (err) => log.error(err.message, { err }),
    warn: (code) => log.warn(`Auth.js warning: ${code}`),
    debug: (message, metadata) => log.debug(message, { metadata }),
  },
  callbacks: {
    async jwt(params) {
      const token = jwtWithRole(params)
      // An update (from `updateSession`, or a client POST to /api/auth/session) never trusts the
      // data it was sent: the name and email are reloaded from the database.
      if (params.trigger === "update" && token.sub) {
        const user = await findUserById(token.sub)
        if (user) {
          token.name = `${user.first_name} ${user.last_name}`
          token.email = user.email
        }
      }
      return token
    },
    session: sessionWithRole,
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

        return {
          id: user.id,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`,
          role: user.role,
        }
      },
    }),
  ],
})
