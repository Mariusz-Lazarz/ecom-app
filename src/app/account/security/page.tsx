import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { CalendarDays } from "lucide-react"

import { PasswordForm } from "@/components/account/password-form"
import { formatOrderDate } from "@/components/orders/format"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireUser } from "@/lib/auth-guards"
import { findUserById } from "@/lib/users"

export const metadata: Metadata = { title: "Security — Northcart" }

export default async function AccountSecurityPage() {
  const session = await requireUser("/account/security")
  const user = await findUserById(session.user.id)
  // The session outlived its account.
  if (!user) notFound()

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Security</h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays aria-hidden className="size-4" />
          Member since {formatOrderDate(user.created_at)}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Change password</CardTitle>
          <CardDescription>You&apos;ll stay signed in on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  )
}
