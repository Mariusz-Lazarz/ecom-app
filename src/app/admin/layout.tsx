import Link from "next/link"
import { ArrowLeft, Shield } from "lucide-react"

import { AdminNav } from "@/components/admin/admin-nav"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { buttonVariants } from "@/components/ui/button"

/**
 * The admin shell: title, section nav, theme toggle and a link back to the store. It renders no data and doesn't
 * guard access itself (layouts don't re-render on navigation); every admin page calls
 * `requireAdmin()`.
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-1 px-4 sm:gap-4 sm:px-6 lg:px-8">
          <Link href="/admin" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Shield className="size-4" />
            </span>
            <span className="text-lg">Admin</span>
          </Link>
          <div className="sm:ml-4">
            <AdminNav />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Link href="/" aria-label="Back to store" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <ArrowLeft data-icon="inline-start" />
              <span className="hidden sm:inline">Back to store</span>
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </>
  )
}
