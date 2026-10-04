import "server-only"

import { auth } from "@/auth"
import type { AgentUser } from "@/lib/agent-token"
import { UnauthorizedError } from "@/lib/errors"

/** The signed-in user the support chat acts for; 401 for visitors. */
export async function chatUser(): Promise<AgentUser> {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError("Sign in to chat with us")
  return { id: session.user.id, role: session.user.role }
}
