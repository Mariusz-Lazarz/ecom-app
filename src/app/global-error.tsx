"use client"

import "./globals.css"

import { useEffect } from "react"

import { ErrorState } from "@/components/errors/error-state"
import { ThemeProvider } from "@/components/theme/theme-provider"
import { Button } from "@/components/ui/button"
import { logger } from "@/lib/logger"

// Last resort for errors in the root layout itself. It replaces the whole document.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    logger.error("Root layout crashed", { scope: "browser", err: error, digest: error.digest })
  }, [error])

  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <title>Something went wrong — Northcart</title>
        <ThemeProvider>
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
        </ThemeProvider>
      </body>
    </html>
  )
}
