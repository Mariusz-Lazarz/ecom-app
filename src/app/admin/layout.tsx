import Link from "next/link"
import { ArrowLeft, Shield } from "lucide-react"

import { auth } from "@/auth"
import { AdminNav } from "@/components/admin/admin-nav"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { buttonVariants } from "@/components/ui/button"
import { countNewContactMessages } from "@/lib/contact"
import { logger } from "@/lib/logger"

const log = logger.child({ scope: "admin.layout" })

/** Unread contact messages for the nav badge: 0 for non-admins (without querying) or when the count fails. */
async function unreadMessages() {
  const session = await auth()
  if (session?.user?.role !== "admin") return 0
  try {
    return await countNewContactMessages()
  } catch (err) {
    log.error("Couldn't count unread messages", { err })
    return 0
  }
}

/**
 * The admin shell: title, section nav (with the unread messages count), theme toggle and a link
 * back to the store. It doesn't guard access itself (layouts don't re-render on navigation); every
 * admin page calls `requireAdmin()`. The badge updates whenever a Server Action refreshes the page.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const unread = await unreadMessages()
  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-1 px-4 sm:gap-4 sm:px-6 lg:px-8">
          <Link href="/admin" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Shield className="size-4" />
            </span>
            <span className="sr-only text-lg sm:not-sr-only">Admin</span>
          </Link>
          <div className="-my-2 min-w-0 overflow-x-auto py-2 sm:ml-4">
            <AdminNav unreadMessages={unread} />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Link href="/" aria-label="Back to store" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <ArrowLeft data-icon="inline-start" />
              <span className="hidden 2xl:inline">Back to store</span>
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </>
  )
}
