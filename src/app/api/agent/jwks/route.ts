import { agentJwks } from "@/lib/agent-token"
import { withErrorHandler } from "@/lib/api/handler"

// Public key of the support agent's tokens (src/lib/agent-token.ts), for HarnessLab to check them.
export const GET = withErrorHandler(async () =>
  Response.json(await agentJwks(), { headers: { "cache-control": "public, max-age=300" } }),
)
