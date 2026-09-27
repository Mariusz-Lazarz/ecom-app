"use client"

import "./globals.css"

import { ErrorState } from "@/components/errors/error-state"
import { Button } from "@/components/ui/button"

// Last resort for errors in the root layout itself. It replaces the whole document.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <title>Something went wrong — Northcart</title>
        <ErrorState
          code="500"
          title="Something went wrong"
          description="Northcart failed to load. Please try again in a moment."
          digest={error.digest}
        >
          <Button size="lg" onClick={() => retry()}>
            Try again
          </Button>
        </ErrorState>
      </body>
    </html>
  )
}
