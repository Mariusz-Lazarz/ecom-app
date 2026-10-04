import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { FlashToaster } from "@/components/notifications/flash-toaster";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Northcart — Everyday goods, thoughtfully picked",
  description: "Shop curated audio, watches, footwear and more with fast delivery and secure checkout.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // next-themes sets the theme class on <html> before hydration.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          {/* Above the support chat bubble in the same corner. */}
          <Toaster position="bottom-right" closeButton offset={{ bottom: "6rem" }} mobileOffset={{ bottom: "5.5rem" }} />
          <FlashToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
