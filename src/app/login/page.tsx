import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { LoginForm } from "@/components/auth/login-form"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Sign in — Northcart",
}

export default async function LoginPage() {
  // Already signed in: nothing to do here.
  if (await auth()) redirect("/")

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
            <LoginForm />
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </>
  )
}
