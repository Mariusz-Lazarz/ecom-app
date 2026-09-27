import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: {
    // Show fetch() calls from the server with their full URL.
    fetches: { fullUrl: true },
    // Forward everything the browser logs to the dev terminal, so one window shows it all.
    browserToTerminal: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/photo-*",
        search: "?w=600&q=80&auto=format&fit=crop",
      },
    ],
  },
};

export default nextConfig;
