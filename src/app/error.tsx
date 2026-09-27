"use client"

import { useEffect } from "react"
import Link from "next/link"

import { ErrorState } from "@/components/errors/error-state"
import { Button, buttonVariants } from "@/components/ui/button"

// Catches anything thrown while rendering a page below the root layout. Server errors arrive here
// with a generic message and a digest that matches the server log entry.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <ErrorState
      code="500"
      title="Something went wrong"
      description="We hit an unexpected problem loading this page. Please try again in a moment."
      digest={error.digest}
    >
      <Button size="lg" onClick={() => retry()}>
        Try again
      </Button>
      <Link href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
        Go home
      </Link>
    </ErrorState>
  )
}
