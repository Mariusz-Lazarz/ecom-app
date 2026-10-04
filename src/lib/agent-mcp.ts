import "server-only"

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import * as z from "zod"

import type { AgentClaims, AgentScope } from "@/lib/agent-token"
import { getMyOrder, listMyOrders } from "@/lib/agent-tools"
import { logger } from "@/lib/logger"

const log = logger.child({ scope: "agent-mcp" })

/**
 * The support agent's MCP server, built for one request and one user: it lists only the tools the
 * token's scopes allow, and every tool works on the token's user. A missing scope also fails the
 * call itself, so hiding a tool is never the only check.
 */
export function agentMcpServer(claims: AgentClaims): McpServer {
  const server = new McpServer({ name: "northcart", version: "1.0.0" })
  const allowed = (scope: AgentScope) => claims.scopes.includes(scope)

  const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] })
  const refuse = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true })

  function guarded<A>(tool: string, scope: AgentScope, run: (args: A) => Promise<ReturnType<typeof json | typeof refuse>>) {
    return async (args: A) => {
      if (!allowed(scope)) {
        log.warn("Agent tool refused: missing scope", { tool, scope, userId: claims.userId })
        return refuse(`This conversation is not allowed to use ${tool}.`)
      }
      log.info("Agent tool called", { tool, userId: claims.userId })
      return run(args)
    }
  }

  if (allowed("orders:read")) {
    server.registerTool(
      "list_my_orders",
      {
        title: "List my orders",
        description:
          "Lists the signed-in customer's orders, newest first, 10 per page: number, status, date placed, item count and total.",
        inputSchema: { page: z.number().int().min(1).max(100).optional().describe("Page number, from 1") },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      guarded("list_my_orders", "orders:read", async ({ page }: { page?: number }) => json(await listMyOrders(claims.userId, page))),
    )

    server.registerTool(
      "get_my_order",
      {
        title: "Get one of my orders",
        description:
          "Details of one of the signed-in customer's orders by its number (e.g. NC-10001): items, totals, shipping, tracking number and status history.",
        inputSchema: { number: z.string().trim().min(1).max(32).describe("Order number, e.g. NC-10001") },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      guarded("get_my_order", "orders:read", async ({ number }: { number: string }) => {
        const order = await getMyOrder(claims.userId, number)
        return order ? json(order) : refuse(`No order ${number} was found on this account.`)
      }),
    )
  }

  return server
}
