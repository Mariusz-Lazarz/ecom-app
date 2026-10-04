import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ChatMessage, ChatSession } from "@/lib/harnesslab"

const notify = { success: vi.fn(), warning: vi.fn(), error: vi.fn() }
vi.mock("@/lib/notify", () => ({ notify }))

const { SupportChat, CHAT_POLL_MS, CHAT_SUGGESTIONS } = await import("@/components/support-chat/support-chat")

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

const posts = () =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([input, init]) => ({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined }))

const panel = () => screen.getByRole("dialog", { hidden: true })

async function openChat(user = userEvent.setup()) {
  await user.click(screen.getByRole("button", { name: "Chat with us" }))
  return user
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  Object.values(notify).forEach((fn) => fn.mockReset())
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("SupportChat bubble", () => {
  it("is a floating button that opens and closes the panel", async () => {
    serve([["GET", /\/api\/chat\/sessions$/, () => Response.json({ sessions: [chatSession()] })]])
    render(<SupportChat />)

    const bubble = screen.getByRole("button", { name: "Chat with us" })
    expect(bubble).toHaveAttribute("aria-expanded", "false")
    expect(panel()).toHaveAttribute("aria-hidden", "true")

    await openChat()
    expect(bubble).toHaveAttribute("aria-expanded", "true")
    expect(bubble).toHaveAccessibleName("Close chat")
    expect(screen.getByRole("dialog", { name: "Northcart assistant" })).toBeVisible()

    await userEvent.click(bubble)
    expect(panel()).toHaveAttribute("aria-hidden", "true")
  })

  it("closes with Escape and gives the focus back to the bubble", async () => {
    serve([["GET", /\/api\/chat\/sessions$/, () => Response.json({ sessions: [chatSession()] })]])
    render(<SupportChat />)
    const user = await openChat()
    await screen.findByText("Where is my order?")

    await user.keyboard("{Escape}")

    expect(panel()).toHaveAttribute("aria-hidden", "true")
    expect(screen.getByRole("button", { name: "Chat with us" })).toHaveFocus()
  })
})

describe("SupportChat conversations", () => {
  it("lists the customer's recent conversations", async () => {
    serve([["GET", /\/api\/chat\/sessions$/, () => Response.json({ sessions: [chatSession(), chatSession({ id: "b", title: null })] })]])
    render(<SupportChat />)
    await openChat()

    expect(await screen.findByText("Where is my order?")).toBeInTheDocument()
    expect(screen.getByText("Recent conversations")).toBeInTheDocument()
    expect(screen.getByText("New conversation")).toBeInTheDocument()
  })

  it("goes straight to a new conversation with suggestions when there are none", async () => {
    serve([["GET", /\/api\/chat\/sessions$/, () => Response.json({ sessions: [] })]])
    render(<SupportChat />)
    await openChat()

    expect(await screen.findByText("Hi! How can we help?")).toBeInTheDocument()
    for (const suggestion of CHAT_SUGGESTIONS) expect(screen.getByRole("button", { name: suggestion })).toBeInTheDocument()
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
            : Response.json({
                messages: [message("2", "assistant", "It **shipped** yesterday.")],
                hasMore: false,
                session: chatSession(),
              })
        },
      ],
    ])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SupportChat />)
    await openChat(user)

    await user.type(await screen.findByRole("textbox", { name: "Message" }), "  Where is NC-10001?  {Enter}")

    expect(await screen.findByText("Where is NC-10001?")).toBeInTheDocument()
    expect(screen.getByRole("status", { name: "The assistant is answering" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled()

    await act(() => vi.advanceTimersByTimeAsync(CHAT_POLL_MS * 2))
    const reply = await screen.findByText(/It/, { selector: "p" })
    expect(within(reply).getByText("shipped").tagName).toBe("STRONG")
    expect(screen.queryByRole("status", { name: "The assistant is answering" })).not.toBeInTheDocument()

    // Done answering: no more polling.
    await act(() => vi.advanceTimersByTimeAsync(CHAT_POLL_MS * 3))
    expect(polls).toBe(2)
    expect(posts()).toEqual([
      { url: "/api/chat/sessions", body: undefined },
      { url: "/api/chat/sessions/a1b2c3d4/messages", body: { message: "Where is NC-10001?" } },
    ])
  })

  it("sends a suggestion when it is clicked", async () => {
    serve([
      ["GET", /\/api\/chat\/sessions$/, () => Response.json({ sessions: [] })],
      ["POST", /\/api\/chat\/sessions$/, () => Response.json({ session: chatSession() }, { status: 201 })],
      [
        "POST",
        /\/messages$/,
        () => Response.json({ message: message("1", "user", CHAT_SUGGESTIONS[0]), session: chatSession({ status: "running" }) }),
      ],
      ["GET", /\/messages\?after=1$/, () => Response.json({ messages: [], hasMore: false, session: chatSession({ status: "running" }) })],
    ])
    render(<SupportChat />)
    const user = await openChat()

    await user.click(await screen.findByRole("button", { name: CHAT_SUGGESTIONS[0] }))

    await waitFor(() => expect(posts()[1]).toEqual({ url: "/api/chat/sessions/a1b2c3d4/messages", body: { message: CHAT_SUGGESTIONS[0] } }))
  })

  it("renders the assistant's Markdown: lists, links and tables, but no raw HTML", async () => {
    const reply = [
      "Your orders:",
      "",
      "- **NC-1010**: Processing",
      "- NC-1004: Delivered",
      "",
      "| Order | Total |",
      "| --- | --- |",
      "| NC-1010 | $179.00 |",
      "",
      "[Track it](https://example.com/track) <img src=x onerror=alert(1)>",
    ].join("\n")
    serve([
      ["GET", /\/api\/chat\/sessions$/, () => Response.json({ sessions: [chatSession()] })],
      [
        "GET",
        /\/a1b2c3d4\/messages$/,
        () => Response.json({ messages: [message("1", "user", "My orders?"), message("2", "assistant", reply)], hasMore: false, session: chatSession() }),
      ],
    ])
    render(<SupportChat />)
    const user = await openChat()
    await user.click(await screen.findByText("Where is my order?"))

    const items = await screen.findAllByRole("listitem")
    expect(items.map((item) => item.textContent)).toEqual(["NC-1010: Processing", "NC-1004: Delivered"])
    expect(screen.getByRole("table")).toHaveTextContent("NC-1010$179.00")
    const link = screen.getByRole("link", { name: "Track it" })
    expect(link).toHaveAttribute("href", "https://example.com/track")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
    expect(document.querySelector("img")).toBeNull()
    // The customer's own message stays plain text.
    expect(screen.getByText("My orders?").tagName).toBe("P")
  })

  it("shows notices and goes back to the list", async () => {
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
    const user = await openChat()
    await user.click(await screen.findByText("Where is my order?"))

    expect(await screen.findByText("Sorry, something went wrong while answering.")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "All conversations" }))
    expect(await screen.findByText("Recent conversations")).toBeInTheDocument()
  })

  it("disables writing while the assistant is unavailable", async () => {
    serve([
      ["GET", /\/api\/chat\/sessions$/, () => Response.json({ sessions: [chatSession({ status: "paused" })] })],
      ["GET", /\/messages$/, () => Response.json({ messages: [], hasMore: false, session: chatSession({ status: "paused" }) })],
    ])
    render(<SupportChat />)
    const user = await openChat()
    await user.click(await screen.findByText("Where is my order?"))

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Message" })).toBeDisabled())
    expect(screen.getByPlaceholderText("The assistant isn't available right now")).toBeInTheDocument()
  })

  it("keeps the typed message and shows an error when sending fails", async () => {
    serve([
      ["GET", /\/api\/chat\/sessions$/, () => Response.json({ sessions: [chatSession()] })],
      ["GET", /\/messages$/, () => Response.json({ messages: [message("1", "user", "Earlier")], hasMore: false, session: chatSession() })],
      [
        "POST",
        /\/messages$/,
        () => Response.json({ error: { code: "conflict", message: "The assistant is still answering" } }, { status: 409 }),
      ],
    ])
    render(<SupportChat />)
    const user = await openChat()
    await user.click(await screen.findByText("Where is my order?"))
    await screen.findByText("Earlier")
    const box = screen.getByRole("textbox", { name: "Message" })

    await user.type(box, "Hello{Enter}")

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith("Your message wasn't sent", { description: "The assistant is still answering" }),
    )
    expect(box).toHaveValue("Hello")
  })
})
