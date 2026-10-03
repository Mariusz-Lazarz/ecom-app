import type { NextConfig } from "next"

// Product photos are served from the media host (CDN in production, the S3 emulator locally).
// The optimiser only fetches from hosts listed here, so MEDIA_PUBLIC_URL must be set at build time.
const mediaPublicUrl = process.env.MEDIA_PUBLIC_URL ? new URL(process.env.MEDIA_PUBLIC_URL) : undefined
const mediaIsLocal = ["localhost", "127.0.0.1", "[::1]"].includes(mediaPublicUrl?.hostname ?? "")

const nextConfig: NextConfig = {
  logging: {
    // Show fetch() calls from the server with their full URL.
    fetches: { fullUrl: true },
    // Forward everything the browser logs to the dev terminal, so one window shows it all.
    browserToTerminal: true,
  },
  experimental: {
    // Admins upload product photos (up to 10 MB each, one per request) through a Server Action.
    // Both limits leave room for the multipart overhead; the proxy would otherwise cut the body at 10 MB.
    serverActions: { bodySizeLimit: "11mb" },
    proxyClientMaxBodySize: "11mb",
  },
  images: {
    remotePatterns: mediaPublicUrl ? [new URL(`${mediaPublicUrl.href.replace(/\/+$/, "")}/**`)] : [],
    // Media objects are content-addressed and never change, so optimised variants can be cached for a long time.
    minimumCacheTTL: 2_678_400, // 31 days
    // The optimiser refuses local IPs by default (SSRF guard). Only lift that for the local S3 emulator.
    dangerouslyAllowLocalIP: mediaIsLocal,
  },
}

export default nextConfig
