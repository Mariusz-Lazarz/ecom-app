import { withErrorHandler } from "@/lib/api/handler"
import { createChatSession, listChatSessions } from "@/lib/harnesslab"

import { chatUser } from "../user"

/** GET /api/chat/sessions — the signed-in user's support conversations, newest activity first. */
export const GET = withErrorHandler(async () => Response.json({ sessions: await listChatSessions(await chatUser()) }))

/** POST /api/chat/sessions — starts a new conversation (201). */
export const POST = withErrorHandler(async () =>
  Response.json({ session: await createChatSession(await chatUser()) }, { status: 201 }),
)
