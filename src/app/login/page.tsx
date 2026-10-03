import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { LoginForm } from "@/components/auth/login-form"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CALLBACK_PARAM, safeCallbackPath } from "@/lib/safe-redirect"

export const metadata: Metadata = {
  title: "Sign in — Northcart",
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Where to go after signing in, e.g. back to /checkout; only same-origin paths are kept.
  const callbackUrl = safeCallbackPath((await searchParams)[CALLBACK_PARAM])

  // Already signed in: nothing to do here.
  if (await auth()) redirect(callbackUrl ?? "/")

  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-16">
        <Card className="w-full max-w-md [--card-spacing:--spacing(6)]">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold tracking-tight">Welcome back</CardTitle>
            <CardDescription>Sign in to your Northcart account.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm callbackUrl={callbackUrl} />
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </>
  )
}
