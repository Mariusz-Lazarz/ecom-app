import { defineConfig } from "vitest/config"

// Integration tests talk to the real services from docker compose (`docker compose up -d`),
// so they run separately from the unit suite: `npm run test:integration`.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
  },
})
