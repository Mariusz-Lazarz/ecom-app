import type { Metadata } from "next"
import { connection } from "next/server"

import { InvalidResetLink } from "@/components/auth/invalid-reset-link"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { isResetTokenValid } from "@/lib/password-reset"
import { RESET_TOKEN_PATTERN } from "@/lib/validation/password-reset"

export const metadata: Metadata = {
  title: "Choose a new password — Northcart",
}

/** The page a reset email links to (`?token=…`): the new password form, or why the link can't be used. */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  await connection()
  const { token } = await searchParams
  const valid = typeof token === "string" && RESET_TOKEN_PATTERN.test(token) && (await isResetTokenValid(token))
  const resetToken = valid ? (token as string) : null

  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-16">
        <Card className="w-full max-w-md [--card-spacing:--spacing(6)]">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold tracking-tight">Choose a new password</CardTitle>
            <CardDescription>
              {valid ? "Pick a password you don't use anywhere else." : "This link can't be used anymore."}
            </CardDescription>
          </CardHeader>
          <CardContent>{resetToken ? <ResetPasswordForm token={resetToken} /> : <InvalidResetLink />}</CardContent>
        </Card>
      </main>
      <SiteFooter />
    </>
  )
}
