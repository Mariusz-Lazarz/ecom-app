import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"

import { agentMcpServer } from "@/lib/agent-mcp"
import { verifyAgentToken } from "@/lib/agent-token"
import { withErrorHandler } from "@/lib/api/handler"
import { UnauthorizedError } from "@/lib/errors"

// The support agent's tools (MCP over Streamable HTTP, stateless, JSON responses). HarnessLab
// calls it with the token the chat routes signed for the user; see src/lib/agent-mcp.ts.
// Stateless means no server-sent stream to GET and no session to DELETE: both answer 405, which
// tells MCP clients not to retry them.
export const POST = withErrorHandler(async (request: Request): Promise<Response> => {
  const token = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]
  if (!token) throw new UnauthorizedError("Agent token required")
  const claims = await verifyAgentToken(token)
  const server = agentMcpServer(claims)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  try {
    return await transport.handleRequest(request)
  } finally {
    await server.close()
  }
})

const methodNotAllowed = () =>
  Response.json(
    { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Method not allowed." } },
    { status: 405, headers: { allow: "POST" } },
  )

export const GET = methodNotAllowed
export const DELETE = methodNotAllowed
