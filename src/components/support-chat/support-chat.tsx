"use client"

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, ArrowUp, Bot, ChevronDown, Info, MessageCircle, MessagesSquare, Plus, X } from "lucide-react"

import { ChatMarkdown } from "@/components/support-chat/chat-markdown"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import type { ChatMessage, ChatMessagesPage, ChatSession } from "@/lib/harnesslab"
import { notify } from "@/lib/notify"
import { cn } from "@/lib/utils"
import { MAX_CHAT_MESSAGE_LENGTH } from "@/lib/validation/chat"

/** How often an open conversation asks for the assistant's reply while it is answering. */
export const CHAT_POLL_MS = 1500

/** Questions a new conversation offers to start with. */
export const CHAT_SUGGESTIONS = ["Where is my latest order?", "Show my recent orders", "Has my order shipped yet?"]

/** A conversation being written that doesn't exist yet; it is created with its first message. */
const NEW = "new"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", ...init })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error?.message ?? "Something went wrong. Please try again.")
  return body as T
}

const sessionLabel = (session: ChatSession) => session.title ?? "New conversation"

function timeLabel(iso: string) {
  const date = new Date(iso)
  return new Date().toDateString() === date.toDateString()
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { day: "numeric", month: "short" })
}

// The chat is portalled to <body>: the header it is rendered from has a backdrop filter, which
// would make the header the containing block of fixed elements.
const noSubscription = () => () => {}
const useMounted = () =>
  useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  )

/**
 * The support assistant for signed-in customers: a chat bubble in the bottom-right corner that
 * opens a panel above it (full screen on phones). The assistant runs in HarnessLab and can look
 * up the customer's own orders; everything goes through the `/api/chat` routes, which sign a
 * token for the customer with every request. The panel lists their conversations; a
 * conversation polls for the reply while the assistant answers. Closing the panel keeps the open
 * conversation.
 */
export function SupportChat() {
  const mounted = useMounted()
  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[] | null>(null)
  // null: the list of conversations; NEW: a conversation not sent yet; otherwise its id.
  const [view, setView] = useState<string | null>(null)
  const titleId = useId()
  const bubbleRef = useRef<HTMLButtonElement>(null)

  const loadSessions = useCallback(async () => {
    try {
      const { sessions } = await request<{ sessions: ChatSession[] }>("/api/chat/sessions")
      setSessions(sessions)
      // Nothing to pick from: go straight to a new conversation.
      if (sessions.length === 0) setView((current) => current ?? NEW)
    } catch (err) {
      setSessions([])
      notify.error("Couldn't load your conversations", { description: (err as Error).message })
    }
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    bubbleRef.current?.focus()
  }, [])

  // Escape closes the chat wherever the focus is, the bubble included.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, close])

  function toggle() {
    if (open) return close()
    setOpen(true)
    if (view === null) {
      setSessions(null)
      void loadSessions()
    }
  }

  function showList() {
    setView(null)
    setSessions(null)
    void loadSessions()
  }

  if (!mounted) return null

  return createPortal(
    <>
      <section
        role="dialog"
        aria-labelledby={titleId}
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "fixed inset-0 z-50 flex flex-col overflow-hidden bg-background shadow-2xl transition-[opacity,translate,scale] duration-200 ease-out",
          "sm:inset-auto sm:right-6 sm:bottom-24 sm:h-[min(40rem,calc(100dvh-8rem))] sm:w-[25rem] sm:origin-bottom-right sm:rounded-2xl sm:border",
          open ? "visible translate-y-0 opacity-100 sm:scale-100" : "invisible translate-y-4 opacity-0 sm:scale-95",
        )}
      >
        <header className="flex items-center gap-3 border-b px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
          {view !== null ? (
            <Button variant="ghost" size="icon-sm" onClick={showList} aria-label="All conversations">
              <ArrowLeft />
            </Button>
          ) : (
            <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Bot className="size-5" />
              <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-background bg-emerald-500" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate font-semibold">
              Northcart assistant
            </h2>
            <p className="truncate text-xs text-muted-foreground">Ask about your orders, any time</p>
          </div>
          {view === null && (
            <Button variant="ghost" size="icon-sm" onClick={() => setView(NEW)} aria-label="New conversation">
              <Plus />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close chat">
            <X className="sm:hidden" />
            <ChevronDown className="hidden sm:block" />
          </Button>
        </header>

        {view === null ? (
          <ConversationList sessions={sessions} onOpen={setView} onNew={() => setView(NEW)} />
        ) : (
          <Conversation
            key={view}
            sessionId={view === NEW ? null : view}
            active={open}
            // The conversation stays mounted (its key is unchanged) and keeps what was sent.
            onCreated={(session) => setSessions((current) => [session, ...(current ?? [])])}
          />
        )}
      </section>

      <button
        ref={bubbleRef}
        type="button"
        onClick={toggle}
        aria-label={open ? "Close chat" : "Chat with us"}
        aria-expanded={open}
        className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-200 hover:scale-105 focus-visible:ring-4 focus-visible:ring-ring/50 focus-visible:outline-none active:scale-95 sm:right-6 sm:bottom-6"
      >
        <MessageCircle className={cn("absolute size-6 transition-all duration-200", open && "scale-50 rotate-90 opacity-0")} />
        <ChevronDown className={cn("absolute size-6 transition-all duration-200", !open && "scale-50 -rotate-90 opacity-0")} />
      </button>
    </>,
    document.body,
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
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4">
      <button
        type="button"
        onClick={onNew}
        className="flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Plus className="size-5" />
        </span>
        <span>
          <span className="block text-sm font-medium">Start a new conversation</span>
          <span className="block text-xs text-muted-foreground">We usually answer in a few seconds</span>
        </span>
      </button>

      {sessions === null &&
        Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} data-testid="conversation-skeleton" className="h-14 rounded-xl" />
        ))}
      {sessions !== null && sessions.length > 0 && (
        <>
          <h3 className="px-1 pt-1 text-xs font-medium text-muted-foreground">Recent conversations</h3>
          <ul className="flex flex-col gap-1">
            {sessions.map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => onOpen(session.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted"
                >
                  <MessagesSquare className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{sessionLabel(session)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {session.status === "running" ? "Answering…" : timeLabel(session.lastActivityAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function Conversation({
  sessionId,
  active,
  onCreated,
}: {
  sessionId: string | null
  // The panel is open: the message box takes the focus.
  active: boolean
  onCreated: (session: ChatSession) => void
}) {
  const [session, setSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<ChatMessage[] | null>(sessionId === null ? [] : null)
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const lastId = useRef<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const append = useCallback((page: { messages: ChatMessage[]; session: ChatSession }) => {
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

  useEffect(() => {
    if (active) inputRef.current?.focus({ preventScroll: true })
  }, [active])

  const paused = session?.status === "paused"

  async function send(text: string) {
    const message = text.trim()
    if (!message || sending || answering || paused) return
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

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void send(input)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void send(input)
    }
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4" aria-live="polite">
        {messages === null && (
          <>
            <Skeleton data-testid="messages-skeleton" className="h-10 w-2/3 self-end rounded-2xl" />
            <Skeleton className="h-20 w-4/5 rounded-2xl" />
          </>
        )}
        {messages?.length === 0 && !sending && (
          <div className="my-auto flex flex-col items-center gap-4 py-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Bot className="size-6" />
            </span>
            <div>
              <p className="font-medium">Hi! How can we help?</p>
              <p className="text-sm text-muted-foreground">I can look up your orders, their status and tracking.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {CHAT_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages?.map((message) => <MessageBubble key={message.id} message={message} />)}
        {(answering || sending) && <TypingBubble label={sending ? "Sending" : "The assistant is answering"} />}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={onSubmit} className="border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2 rounded-2xl border bg-muted/40 p-1.5 transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
          <textarea
            ref={inputRef}
            aria-label="Message"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            maxLength={MAX_CHAT_MESSAGE_LENGTH}
            placeholder={paused ? "The assistant isn't available right now" : "Write a message…"}
            disabled={paused}
            rows={1}
            // text-base on phones: iOS zooms into inputs with smaller text.
            className="field-sizing-content max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed sm:text-sm"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send"
            className="shrink-0 rounded-full"
            disabled={!input.trim() || sending || answering || paused}
          >
            {sending ? <Spinner /> : <ArrowUp />}
          </Button>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
          The assistant only sees your own orders. Answers may be imperfect.
        </p>
      </form>
    </>
  )
}

function BotAvatar() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Bot className="size-4" />
    </span>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const time = new Date(message.createdAt).toLocaleString()
  if (message.role === "notice") {
    return (
      <p className="flex items-center gap-1.5 self-center rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
        <Info className="size-3.5 shrink-0" /> {message.content}
      </p>
    )
  }
  if (message.role === "user") {
    return (
      <p
        title={time}
        className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm break-words whitespace-pre-wrap text-primary-foreground"
      >
        {message.content}
      </p>
    )
  }
  return (
    <div className="flex max-w-[90%] items-end gap-2 self-start" title={time}>
      <BotAvatar />
      <div className="min-w-0 rounded-2xl rounded-bl-md bg-muted px-3.5 py-2">
        <ChatMarkdown>{message.content}</ChatMarkdown>
      </div>
    </div>
  )
}

function TypingBubble({ label }: { label: string }) {
  return (
    <div className="flex items-end gap-2 self-start">
      <BotAvatar />
      <div role="status" aria-label={label} className="flex gap-1 rounded-2xl rounded-bl-md bg-muted px-4 py-3">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
