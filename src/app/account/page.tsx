import type { Metadata } from "next"

import { logout } from "@/app/actions/logout"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { requireUser } from "@/lib/auth-guards"

export const metadata: Metadata = {
  title: "Account — Northcart",
}

export default async function AccountPage() {
  // Signed-out visitors have no account to show.
  const session = await requireUser()

  // Auth.js stores "First Last" as the name; greet by first name only.
  const firstName = session.user.name?.split(" ")[0]

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-start gap-6 px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            {firstName ? `Hey ${firstName}, welcome back!` : "Welcome back!"}
          </h1>
          {session.user.role === "admin" && <Badge>Admin</Badge>}
        </div>
        <form action={logout}>
          <Button type="submit" variant="outline">
            Log out
          </Button>
        </form>
      </main>
      <SiteFooter />
    </>
  )
}
