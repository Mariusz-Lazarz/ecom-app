import type { Metadata } from "next"
import Link from "next/link"
import { ChevronRight, Heart, KeyRound, MapPin, Package, UserRound, type LucideIcon } from "lucide-react"

import { logout } from "@/app/actions/logout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requireUser } from "@/lib/auth-guards"

export const metadata: Metadata = {
  title: "Account — Northcart",
}

const SECTIONS = [
  { href: "/account/orders", icon: Package, title: "Your orders", description: "Track, review or cancel your orders" },
  { href: "/account/wishlist", icon: Heart, title: "Your wishlist", description: "Products you saved for later" },
  { href: "/account/profile", icon: UserRound, title: "Profile", description: "Your name and email" },
  { href: "/account/addresses", icon: MapPin, title: "Addresses", description: "Where we ship your orders" },
  { href: "/account/security", icon: KeyRound, title: "Security", description: "Change your password" },
] as const

export default async function AccountPage() {
  // Signed-out visitors have no account to show.
  const session = await requireUser()

  // Auth.js stores "First Last" as the name; greet by first name only.
  const firstName = session.user.name?.split(" ")[0]

  return (
    <div className="flex flex-col items-start gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          {firstName ? `Hey ${firstName}, welcome back!` : "Welcome back!"}
        </h1>
        {session.user.role === "admin" && <Badge>Admin</Badge>}
      </div>
      <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SECTIONS.map((section) => (
          <AccountLink key={section.href} {...section} />
        ))}
      </div>
      <form action={logout}>
        <Button type="submit" variant="outline">
          Log out
        </Button>
      </form>
    </div>
  )
}

function AccountLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <Card className="transition-colors hover:bg-muted/50">
      <CardContent>
        <Link href={href} className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <Icon className="size-5" />
          </span>
          <span className="flex-1">
            <span className="block font-medium">{title}</span>
            <span className="block text-sm text-muted-foreground">{description}</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      </CardContent>
    </Card>
  )
}
