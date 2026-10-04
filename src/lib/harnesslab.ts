import "server-only"

import { signAgentToken, type AgentUser } from "@/lib/agent-token"
import { AppError, ConflictError, NotFoundError, ServiceUnavailableError } from "@/lib/errors"
import { logger } from "@/lib/logger"

const log = logger.child({ scope: "harnesslab" })

/**
 * Client of HarnessLab's app API, which runs the support agent. Every call is made for one
 * signed-in user: it carries the shop's API key and a fresh agent token for that user
 * (src/lib/agent-token.ts), and HarnessLab only ever shows that user their own conversations.
 */

export type ChatSessionStatus = "idle" | "running" | "paused"

export type ChatSession = {
  id: string
  title: string | null
  createdAt: string
  lastActivityAt: string
  status: ChatSessionStatus
}

export type ChatMessage = {
  id: string
  role: "user" | "assistant" | "notice"
  content: string
  createdAt: string
}

export type ChatMessagesPage = { messages: ChatMessage[]; hasMore: boolean; session: ChatSession }

const TIMEOUT_MS = 10_000

function config() {
  const url = process.env.HARNESSLAB_APP_API_URL
  const apiKey = process.env.HARNESSLAB_APP_API_KEY
  if (!url || !apiKey) throw new ServiceUnavailableError("The support chat is not configured")
  return { url: url.replace(/\/+$/, ""), apiKey }
}

async function call<T>(user: AgentUser, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { url, apiKey } = config()
  const token = await signAgentToken(user)
  let res: Response
  try {
    res = await fetch(`${url}/v1${path}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "x-user-token": token,
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
  } catch (err) {
    throw new ServiceUnavailableError("The support chat is unavailable right now", { cause: err })
  }
  const body = await res.json().catch(() => ({}))
  if (res.ok) return body as T
  const message = typeof body?.error === "string" ? body.error : `HTTP ${res.status}`
  if (res.status === 404) throw new NotFoundError("Conversation not found")
  if (res.status === 409) throw new ConflictError(message.includes("budget") ? "The assistant is not available right now" : "The assistant is still answering")
  if (res.status === 400) throw new AppError(message, 400, "bad_request")
  // 401 means our key or token was refused: a configuration problem, not the user's.
  log.error("HarnessLab refused a request", { status: res.status, path, message })
  throw new ServiceUnavailableError("The support chat is unavailable right now")
}

export async function listChatSessions(user: AgentUser): Promise<ChatSession[]> {
  return (await call<{ sessions: ChatSession[] }>(user, "/sessions")).sessions
}

export async function createChatSession(user: AgentUser): Promise<ChatSession> {
  return (await call<{ session: ChatSession }>(user, "/sessions", { method: "POST" })).session
}

/** Without `after`: the newest messages (or those before `before`). With `after`: newer ones, oldest first. */
export async function listChatMessages(
  user: AgentUser,
  sessionId: string,
  page: { after?: string; before?: string } = {},
): Promise<ChatMessagesPage> {
  const query = new URLSearchParams(page as Record<string, string>).toString()
  return call<ChatMessagesPage>(user, `/sessions/${sessionId}/messages${query ? `?${query}` : ""}`)
}

export async function sendChatMessage(
  user: AgentUser,
  sessionId: string,
  message: string,
): Promise<{ message: ChatMessage; session: ChatSession }> {
  return call(user, `/sessions/${sessionId}/messages`, { method: "POST", body: { message } })
}
