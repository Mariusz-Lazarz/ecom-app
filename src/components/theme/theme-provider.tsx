"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

/**
 * Light / dark / system theming. The choice is kept in localStorage under `theme` and applied
 * as a `dark` class on <html> by an inline script before the page paints, so there is no flash
 * of the wrong theme. "system" follows the OS preference and is the default.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  )
}
