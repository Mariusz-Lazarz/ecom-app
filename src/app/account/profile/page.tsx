import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ProfileForm } from "@/components/account/profile-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireUser } from "@/lib/auth-guards"
import { findUserById } from "@/lib/users"

export const metadata: Metadata = { title: "Profile — Northcart" }

export default async function AccountProfilePage() {
  const session = await requireUser("/account/profile")
  const user = await findUserById(session.user.id)
  // The session outlived its account.
  if (!user) notFound()

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">Profile</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Personal details</CardTitle>
          <CardDescription>Your name is used for greetings and as the default name on new addresses.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm profile={{ firstName: user.first_name, lastName: user.last_name, email: user.email }} />
        </CardContent>
      </Card>
    </div>
  )
}
