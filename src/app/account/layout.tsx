import { AccountNav } from "@/components/account/account-nav"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"

/**
 * The account shell: the site header and footer around the section nav and the page. It renders
 * no account data and doesn't guard access itself (layouts don't re-render on navigation); every
 * account page calls `requireUser()`.
 */
export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return (
    <>
      <SiteHeader />
      <div className="mx-auto grid w-full max-w-7xl flex-1 items-start grid-cols-[minmax(0,1fr)] gap-6 px-4 py-8 sm:px-6 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-10 lg:px-8">
        <aside className="md:sticky md:top-32">
          <AccountNav />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
      <SiteFooter />
    </>
  )
}
