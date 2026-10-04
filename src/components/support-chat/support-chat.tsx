"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { ArrowLeft, Bot, Info, MessageCircle, Plus, SendHorizontal } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import type { ChatMessage, ChatMessagesPage, ChatSession } from "@/lib/harnesslab"
import { notify } from "@/lib/notify"
import { cn } from "@/lib/utils"
import { MAX_CHAT_MESSAGE_LENGTH } from "@/lib/validation/chat"

/** How often an open conversation asks for the assistant's reply while it is answering. */
export const CHAT_POLL_MS = 1500

/** A conversation being written that doesn't exist yet; it is created with its first message. */
const NEW = "new"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", ...init })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error?.message ?? "Something went wrong. Please try again.")
  return body as T
}

function sessionLabel(session: ChatSession) {
  return session.title ?? "New conversation"
}

/**
 * The header's chat icon and the support assistant it opens, for signed-in customers. The
 * assistant runs in HarnessLab and can look up the customer's own orders; everything goes through
 * the `/api/chat` routes, which sign a token for the customer with every request. The list shows
 * their conversations; a conversation polls for the reply while the assistant answers.
 */
export function SupportChat() {
  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[] | null>(null)
  // null: the list of conversations; NEW: a conversation not sent yet; otherwise its id.
  const [view, setView] = useState<string | null>(null)

  const loadSessions = useCallback(async () => {
    try {
      const { sessions } = await request<{ sessions: ChatSession[] }>("/api/chat/sessions")
      setSessions(sessions)
    } catch (err) {
      setSessions([])
      notify.error("Couldn't load your conversations", { description: (err as Error).message })
    }
  }, [])

  function show() {
    setOpen(true)
    setView(null)
    setSessions(null)
    void loadSessions()
  }

  return (
    <>
      <button
        type="button"
        aria-label="Chat with us"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={buttonVariants({ variant: "ghost", size: "icon" })}
        onClick={show}
      >
        <MessageCircle />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full gap-0 sm:max-w-md">
          {view === null ? (
            <ConversationList sessions={sessions} onOpen={setView} onNew={() => setView(NEW)} />
          ) : (
            <Conversation
              key={view}
              sessionId={view === NEW ? null : view}
              onBack={() => {
                setView(null)
                void loadSessions()
              }}
              // The conversation stays mounted (its key is unchanged) and keeps what was sent.
              onCreated={(session) => setSessions((current) => [session, ...(current ?? [])])}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

function ConversationList({
  sessions,
  onOpen,
  onNew,
}: {
  sessions: ChatSession[] | null
  onOpen: (id: string) => void
  onNew: () => void
}) {
  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle>Ask Northcart</SheetTitle>
        <SheetDescription>Our assistant can check your orders: status, items, shipping and tracking.</SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
        <Button onClick={onNew} className="w-full">
          <Plus /> New conversation
        </Button>
        {sessions === null &&
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} data-testid="conversation-skeleton" className="h-14" />)}
        {sessions?.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No conversations yet.</p>
        )}
        <ul className="flex flex-col gap-1">
          {sessions?.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                onClick={() => onOpen(session.id)}
                className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left hover:bg-muted"
              >
                <span className="line-clamp-1 font-medium">{sessionLabel(session)}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(session.lastActivityAt).toLocaleString()}
                  {session.status === "running" && " · answering…"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

function Conversation({
  sessionId,
  onBack,
  onCreated,
}: {
  sessionId: string | null
  onBack: () => void
  onCreated: (session: ChatSession) => void
}) {
  const [session, setSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<ChatMessage[] | null>(sessionId === null ? [] : null)
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const lastId = useRef<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const append = useCallback((page: ChatMessagesPage | { messages: ChatMessage[]; session: ChatSession }) => {
    setSession(page.session)
    if (page.messages.length === 0) return
    lastId.current = page.messages[page.messages.length - 1].id
    setMessages((current) => {
      const known = new Set((current ?? []).map((message) => message.id))
      return [...(current ?? []), ...page.messages.filter((message) => !known.has(message.id))]
    })
  }, [])

  // The conversation's latest messages.
  useEffect(() => {
    if (sessionId === null) return
    let cancelled = false
    request<ChatMessagesPage>(`/api/chat/sessions/${sessionId}/messages`)
      .then((page) => {
        if (cancelled) return
        setMessages([])
        append(page)
      })
      .catch((err) => {
        if (cancelled) return
        setMessages([])
        notify.error("Couldn't load this conversation", { description: (err as Error).message })
      })
    return () => {
      cancelled = true
    }
  }, [sessionId, append])

  // While the assistant answers, ask for new messages until it is done.
  const answering = session?.status === "running"
  const currentId = session?.id
  useEffect(() => {
    if (!answering || !currentId) return
    const id = currentId
    const timer = setInterval(async () => {
      try {
        const after = lastId.current ? `?after=${lastId.current}` : ""
        append(await request<ChatMessagesPage>(`/api/chat/sessions/${id}/messages${after}`))
      } catch {
        // The next tick tries again.
      }
    }, CHAT_POLL_MS)
    return () => clearInterval(timer)
  }, [answering, currentId, append])

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: "end" })
  }, [messages, answering])

  async function send(event?: FormEvent) {
    event?.preventDefault()
    const message = input.trim()
    if (!message || sending || answering || session?.status === "paused") return
    setSending(true)
    try {
      let id = session?.id ?? sessionId
      if (!id) {
        const created = await request<{ session: ChatSession }>("/api/chat/sessions", { method: "POST" })
        id = created.session.id
        setSession(created.session)
        onCreated(created.session)
      }
      const sent = await request<{ message: ChatMessage; session: ChatSession }>(`/api/chat/sessions/${id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      })
      setInput("")
      append({ messages: [sent.message], session: sent.session })
    } catch (err) {
      notify.error("Your message wasn't sent", { description: (err as Error).message })
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void send()
    }
  }

  const paused = session?.status === "paused"

  return (
    <>
      <SheetHeader className="flex-row items-center gap-2 border-b pr-12">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="All conversations">
          <ArrowLeft />
        </Button>
        <SheetTitle className="line-clamp-1">{session ? sessionLabel(session) : "New conversation"}</SheetTitle>
        <SheetDescription className="sr-only">A conversation with the Northcart assistant.</SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
        {messages === null && <Skeleton data-testid="messages-skeleton" className="h-24" />}
        {messages?.length === 0 && !sending && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Ask about your orders, e.g. &ldquo;Where is my last order?&rdquo;
          </p>
        )}
        {messages?.map((message) => <MessageBubble key={message.id} message={message} />)}
        {answering && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> The assistant is answering…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex items-end gap-2 border-t p-4">
        <Textarea
          aria-label="Message"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={MAX_CHAT_MESSAGE_LENGTH}
          placeholder={paused ? "The assistant isn't available right now" : "Write a message…"}
          disabled={paused}
          rows={1}
          className="max-h-40 min-h-10 resize-none"
        />
        <Button type="submit" size="icon" aria-label="Send" disabled={!input.trim() || sending || answering || paused}>
          {sending ? <Spinner /> : <SendHorizontal />}
        </Button>
      </form>
    </>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "notice") {
    return (
      <p className="flex items-center gap-2 self-center rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
        <Info className="size-3.5" /> {message.content}
      </p>
    )
  }
  const mine = message.role === "user"
  return (
    <div className={cn("flex gap-2", mine && "justify-end")}>
      {!mine && <Bot className="mt-2 size-4 shrink-0 text-muted-foreground" aria-hidden />}
      <p
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
          mine ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        {message.content}
      </p>
    </div>
  )
}
