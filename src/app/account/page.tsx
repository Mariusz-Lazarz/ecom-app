import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { logout } from "@/app/actions/logout"
import { auth } from "@/auth"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Account — Northcart",
}

export default async function AccountPage() {
  // Signed-out visitors have no account to show.
  const session = await auth()
  if (!session) redirect("/login")

  // Auth.js stores "First Last" as the name; greet by first name only.
  const firstName = session.user?.name?.split(" ")[0]

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-start gap-6 px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          {firstName ? `Hey ${firstName}, welcome back!` : "Welcome back!"}
        </h1>
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
