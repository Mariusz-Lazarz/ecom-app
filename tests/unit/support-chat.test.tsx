import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ChatMessage, ChatSession } from "@/lib/harnesslab"

const notify = { success: vi.fn(), warning: vi.fn(), error: vi.fn() }
vi.mock("@/lib/notify", () => ({ notify }))

const { SupportChat, CHAT_POLL_MS } = await import("@/components/support-chat/support-chat")

const fetchMock = vi.fn<typeof fetch>()

const at = "2026-10-04T12:00:00Z"
const chatSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
  id: "a1b2c3d4",
  title: "Where is my order?",
  createdAt: at,
  lastActivityAt: at,
  status: "idle",
  ...overrides,
})
const message = (id: string, role: ChatMessage["role"], content: string): ChatMessage => ({ id, role, content, createdAt: at })

/** Answers each request with the first route whose method and path match. */
function serve(routes: [method: string, path: RegExp, respond: () => Response][]) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const route = routes.find(([m, path]) => m === method && path.test(url))
    if (!route) throw new Error(`unexpected ${method} ${url}`)
    return route[2]()
  })
}

const calls = () => fetchMock.mock.calls.map(([input, init]) => `${init?.method ?? "GET"} ${String(input)}`)

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  Object.values(notify).forEach((fn) => fn.mockReset())
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("SupportChat", () => {
  it("lists the customer's conversations when opened", async () => {
    serve([["GET", /\/api\/chat\/sessions$/, () => Response.json({ sessions: [chatSession(), chatSession({ id: "b", title: null })] })]])
    render(<SupportChat />)

    await userEvent.click(screen.getByRole("button", { name: "Chat with us" }))

    expect(await screen.findByText("Where is my order?")).toBeInTheDocument()
    expect(screen.getByText("New conversation", { selector: "span" })).toBeInTheDocument()
  })

  it("says so when there are no conversations yet", async () => {
    serve([["GET", /\/api\/chat\/sessions$/, () => Response.json({ sessions: [] })]])
    render(<SupportChat />)
    await userEvent.click(screen.getByRole("button", { name: "Chat with us" }))
    expect(await screen.findByText("No conversations yet.")).toBeInTheDocument()
  })

  it("creates the conversation with the first message, then polls until the reply arrives", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let polls = 0
    serve([
      ["GET", /\/api\/chat\/sessions$/, () => Response.json({ sessions: [] })],
      ["POST", /\/api\/chat\/sessions$/, () => Response.json({ session: chatSession({ title: null }) }, { status: 201 })],
      [
        "POST",
        /\/api\/chat\/sessions\/a1b2c3d4\/messages$/,
        () =>
          Response.json(
            { message: message("1", "user", "Where is NC-10001?"), session: chatSession({ status: "running" }) },
            { status: 202 },
          ),
      ],
      [
        "GET",
        /\/messages\?after=1$/,
        () => {
          polls += 1
          return polls === 1
            ? Response.json({ messages: [], hasMore: false, session: chatSession({ status: "running" }) })
            : Response.json({ messages: [message("2", "assistant", "It shipped yesterday.")], hasMore: false, session: chatSession() })
        },
      ],
    ])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SupportChat />)
    await user.click(screen.getByRole("button", { name: "Chat with us" }))
    await user.click(await screen.findByRole("button", { name: /New conversation/ }))

    await user.type(screen.getByRole("textbox", { name: "Message" }), "  Where is NC-10001?  {Enter}")

    expect(await screen.findByText("Where is NC-10001?")).toBeInTheDocument()
    expect(screen.getByText("The assistant is answering…")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled()
    const post = fetchMock.mock.calls.find(([input, init]) => init?.method === "POST" && String(input).endsWith("/messages"))
    expect(JSON.parse(String(post![1]!.body))).toEqual({ message: "Where is NC-10001?" })

    await act(() => vi.advanceTimersByTimeAsync(CHAT_POLL_MS * 2))
    expect(await screen.findByText("It shipped yesterday.")).toBeInTheDocument()
    expect(screen.queryByText("The assistant is answering…")).not.toBeInTheDocument()

    // Done answering: no more polling.
    await act(() => vi.advanceTimersByTimeAsync(CHAT_POLL_MS * 3))
    expect(polls).toBe(2)
    expect(calls().filter((call) => call.startsWith("POST"))).toEqual([
      "POST /api/chat/sessions",
      "POST /api/chat/sessions/a1b2c3d4/messages",
    ])
  })

  it("opens a conversation with its messages and notices", async () => {
    serve([
      ["GET", /\/api\/chat\/sessions$/, () => Response.json({ sessions: [chatSession()] })],
      [
        "GET",
        /\/a1b2c3d4\/messages$/,
        () =>
          Response.json({
            messages: [message("1", "user", "Hi"), message("2", "notice", "Sorry, something went wrong while answering.")],
            hasMore: false,
            session: chatSession(),
          }),
      ],
    ])
    render(<SupportChat />)
    await userEvent.click(screen.getByRole("button", { name: "Chat with us" }))
    await userEvent.click(await screen.findByText("Where is my order?"))

    expect(await screen.findByText("Hi")).toBeInTheDocument()
    expect(screen.getByText("Sorry, something went wrong while answering.")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "All conversations" }))
    expect(await screen.findByRole("button", { name: /New conversation/ })).toBeInTheDocument()
  })

  it("disables writing while the assistant is unavailable", async () => {
    serve([
      ["GET", /\/api\/chat\/sessions$/, () => Response.json({ sessions: [chatSession({ status: "paused" })] })],
      ["GET", /\/messages$/, () => Response.json({ messages: [], hasMore: false, session: chatSession({ status: "paused" }) })],
    ])
    render(<SupportChat />)
    await userEvent.click(screen.getByRole("button", { name: "Chat with us" }))
    await userEvent.click(await screen.findByText("Where is my order?"))

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Message" })).toBeDisabled())
    expect(screen.getByPlaceholderText("The assistant isn't available right now")).toBeInTheDocument()
  })

  it("keeps the typed message and shows an error when sending fails", async () => {
    serve([
      ["GET", /\/api\/chat\/sessions$/, () => Response.json({ sessions: [chatSession()] })],
      ["GET", /\/messages$/, () => Response.json({ messages: [], hasMore: false, session: chatSession() })],
      [
        "POST",
        /\/messages$/,
        () => Response.json({ error: { code: "conflict", message: "The assistant is still answering" } }, { status: 409 }),
      ],
    ])
    render(<SupportChat />)
    await userEvent.click(screen.getByRole("button", { name: "Chat with us" }))
    await userEvent.click(await screen.findByText("Where is my order?"))
    const box = await screen.findByRole("textbox", { name: "Message" })

    await userEvent.type(box, "Hello{Enter}")

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith("Your message wasn't sent", { description: "The assistant is still answering" }),
    )
    expect(box).toHaveValue("Hello")
  })
})
