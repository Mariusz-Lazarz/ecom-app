import { withErrorHandler } from "@/lib/api/handler"
import { BadRequestError } from "@/lib/errors"
import { listChatMessages, sendChatMessage } from "@/lib/harnesslab"
import { ChatMessageSchema, ChatMessagesQuerySchema, ChatSessionIdSchema } from "@/lib/validation/chat"
import { searchParamsToObject } from "@/lib/validation/products"

import { chatUser } from "../../../user"

type Context = RouteContext<"/api/chat/sessions/[id]/messages">

/**
 * GET /api/chat/sessions/[id]/messages?after=|before= — a conversation's messages with its status
 * (`running` while the assistant answers). 404 for a conversation that isn't the user's.
 */
export const GET = withErrorHandler(async (request: Request, ctx: Context) => {
  const user = await chatUser()
  const id = ChatSessionIdSchema.parse((await ctx.params).id)
  const query = ChatMessagesQuerySchema.safeParse(searchParamsToObject(new URL(request.url).searchParams))
  if (!query.success) throw new BadRequestError("Invalid query", { issues: query.error.issues.map((i) => i.message) })
  return Response.json(await listChatMessages(user, id, query.data))
})

/** POST /api/chat/sessions/[id]/messages {message} — asks the assistant (202); 409 while it is still answering. */
export const POST = withErrorHandler(async (request: Request, ctx: Context) => {
  const user = await chatUser()
  const id = ChatSessionIdSchema.parse((await ctx.params).id)
  const { message } = ChatMessageSchema.parse(await request.json().catch(() => ({})))
  return Response.json(await sendChatMessage(user, id, message), { status: 202 })
})
