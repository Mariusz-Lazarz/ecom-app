import type { Metadata } from "next"

import { RegisterForm } from "@/components/auth/register-form"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Create account — Northcart",
}

export default function RegisterPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-16">
        <Card className="w-full max-w-md [--card-spacing:--spacing(6)]">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold tracking-tight">Create your account</CardTitle>
            <CardDescription>Join Northcart for faster checkout and members-only deals.</CardDescription>
          </CardHeader>
          <CardContent>
            <RegisterForm />
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </>
  )
}
