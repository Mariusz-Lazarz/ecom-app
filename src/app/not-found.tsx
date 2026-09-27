import type { Metadata } from "next"
import Link from "next/link"

import { ErrorState } from "@/components/errors/error-state"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { buttonVariants } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Page not found — Northcart",
}

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <ErrorState
        code="404"
        title="Page not found"
        description="The page you're looking for doesn't exist or has been moved."
      >
        <Link href="/" className={buttonVariants({ size: "lg" })}>
          Back to shop
        </Link>
      </ErrorState>
      <SiteFooter />
    </>
  )
}
