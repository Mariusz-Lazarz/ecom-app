import Link from "next/link"
import { LinkIcon } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { INVALID_RESET_TOKEN_MESSAGE } from "@/lib/validation/password-reset"

/** Shown instead of the reset form when the link's token can't be used. */
export function InvalidResetLink() {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-4 text-center">
      <LinkIcon className="size-10 text-muted-foreground" />
      <h2 className="text-lg font-semibold">{INVALID_RESET_TOKEN_MESSAGE}</h2>
      <p className="text-sm text-muted-foreground">
        Reset links work once and expire after an hour. Request a new one and we&apos;ll email it to you.
      </p>
      <Link href="/forgot-password" className={buttonVariants({ className: "mt-2 h-10 px-4" })}>
        Request a new link
      </Link>
    </div>
  )
}
