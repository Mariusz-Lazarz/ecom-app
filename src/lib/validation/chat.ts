import * as z from "zod"

export const MAX_CHAT_MESSAGE_LENGTH = 2000

/** A conversation id as HarnessLab issues them. */
export const ChatSessionIdSchema = z.string().regex(/^[0-9a-f]{8}$/, { error: "Not a valid conversation id." })

export const ChatMessageSchema = z.object({
  message: z
    .string({ error: "Write a message." })
    .trim()
    .min(1, { error: "Write a message." })
    .max(MAX_CHAT_MESSAGE_LENGTH, { error: `Messages can be at most ${MAX_CHAT_MESSAGE_LENGTH} characters.` }),
})

const messageId = z.string().regex(/^[1-9]\d{0,18}$/, { error: "Not a valid message id." })

/** `after` polls for newer messages, `before` pages back; not both. */
export const ChatMessagesQuerySchema = z
  .object({ after: messageId.optional(), before: messageId.optional() })
  .refine((query) => !(query.after && query.before), { error: "Use after or before, not both." })
