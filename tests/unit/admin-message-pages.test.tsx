import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ContactMessage, ContactMessageDetail } from "@/lib/contact"
import type { Subscriber } from "@/lib/newsletter"
import type { Page } from "@/lib/orders"

const requireAdmin = vi.fn()
const contact = {
  listContactMessages: vi.fn<(query: unknown) => Promise<Page<ContactMessage>>>(),
  getContactMessageCounts: vi.fn(),
  getContactMessage: vi.fn<(id: string) => Promise<ContactMessageDetail | null>>(),
}
const newsletter = {
  listSubscribers: vi.fn<(query: unknown) => Promise<Page<Subscriber>>>(),
  getSubscriberCounts: vi.fn(),
}
const notFound = vi.fn(() => {
  throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" })
})

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth-guards", () => ({ requireAdmin: (returnTo?: string) => requireAdmin(returnTo) }))
vi.mock("@/lib/contact", () => ({
  listContactMessages: (q: unknown) => contact.listContactMessages(q),
  getContactMessageCounts: () => contact.getContactMessageCounts(),
  getContactMessage: (id: string) => contact.getContactMessage(id),
}))
vi.mock("@/lib/newsletter", () => ({
  listSubscribers: (q: unknown) => newsletter.listSubscribers(q),
  getSubscriberCounts: () => newsletter.getSubscriberCounts(),
}))
vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
  usePathname: () => "/admin/messages",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
vi.mock("@/app/actions/contact", () => ({ setContactMessageStatus: vi.fn() }))

const { default: MessagesPage } = await import("@/app/admin/messages/page")
const { default: MessagePage } = await import("@/app/admin/messages/[id]/page")
const { default: NewsletterPage } = await import("@/app/admin/newsletter/page")

const ID = "0b0c4d4e-1111-4222-8333-444455556666"
const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }

const message = (overrides: Partial<ContactMessage> = {}): ContactMessage => ({
  id: ID,
  name: "Ada Lovelace",
  email: "ada@example.com",
  orderNumber: "NC-10001",
  topic: "order",
  message: "Where is my parcel?\nIt's been a week.",
  status: "new",
  userId: "8d3c1f7a-1b2c-4d5e-8f90-a1b2c3d4e5f6",
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-10-01T10:00:00Z"),
  ...overrides,
})

const page = <T,>(items: T[], extra: Partial<Page<T>> = {}): Page<T> => ({
  items,
  page: 1,
  pageSize: 20,
  total: items.length,
  pageCount: items.length ? 1 : 0,
  ...extra,
})

const renderList = async (searchParams: Record<string, string> = {}) =>
  render(await MessagesPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }))
const renderMessage = async (id: string) =>
  render(await MessagePage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }))
const renderNewsletter = async (searchParams: Record<string, string> = {}) =>
  render(await NewsletterPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }))

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { id: "admin-1", role: "admin" } })
  contact.listContactMessages.mockReset().mockResolvedValue(page([]))
  contact.getContactMessageCounts.mockReset().mockResolvedValue({ new: 0, read: 0, archived: 0 })
  contact.getContactMessage.mockReset().mockResolvedValue(null)
  newsletter.listSubscribers.mockReset().mockResolvedValue(page([]))
  newsletter.getSubscriberCounts.mockReset().mockResolvedValue({ subscribed: 0, unsubscribed: 0 })
  notFound.mockClear()
})

describe("guards", () => {
  beforeEach(() => {
    requireAdmin.mockImplementation(async () => notFound())
  })

  it("the message list, a message and the newsletter 404 for non-admins before reading anything", async () => {
    await expect(renderList({ status: "new" })).rejects.toMatchObject(NOT_FOUND)
    await expect(renderMessage(ID)).rejects.toMatchObject(NOT_FOUND)
    await expect(renderNewsletter()).rejects.toMatchObject(NOT_FOUND)

    expect(requireAdmin.mock.calls).toEqual([["/admin/messages"], [`/admin/messages/${ID}`], ["/admin/newsletter"]])
    expect(contact.listContactMessages).not.toHaveBeenCalled()
    expect(contact.getContactMessage).not.toHaveBeenCalled()
    expect(newsletter.listSubscribers).not.toHaveBeenCalled()
  })
})

describe("/admin/messages", () => {
  it("lists messages with status chips, keeping the search in the chips", async () => {
    contact.getContactMessageCounts.mockResolvedValue({ new: 2, read: 5, archived: 1 })
    contact.listContactMessages.mockResolvedValue(page([message(), message({ id: "m2", name: "Ben Carter", status: "read", orderNumber: null })]))

    await renderList({ q: "parcel" })

    expect(contact.listContactMessages).toHaveBeenCalledWith({ status: undefined, q: "parcel", page: 1, pageSize: 20 })
    const chips = within(screen.getByRole("navigation", { name: "Filter by status" })).getAllByRole("link")
    expect(chips.map((c) => [c.textContent, c.getAttribute("href")])).toEqual([
      ["All8", "/admin/messages?q=parcel"],
      ["New2", "/admin/messages?status=new&q=parcel"],
      ["Read5", "/admin/messages?status=read&q=parcel"],
      ["Archived1", "/admin/messages?status=archived&q=parcel"],
    ])
    expect(screen.getByText("2 messages matching “parcel”")).toBeInTheDocument()
    const table = screen.getByRole("table", { name: "Messages" })
    expect(within(table).getByRole("link", { name: "Ada Lovelace" })).toHaveAttribute("href", `/admin/messages/${ID}`)
    expect(within(table).getByText("NC-10001")).toBeInTheDocument()
    expect(within(table).getAllByText("New")).toHaveLength(1)
  })

  it("has an empty state that offers to clear the filters", async () => {
    await renderList({ status: "archived" })

    expect(screen.getByText("No messages")).toBeInTheDocument()
    expect(screen.getByText("No messages match these filters.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/admin/messages")
  })

  it("says there are none yet without filters", async () => {
    await renderList()

    expect(screen.getByText("When customers use the contact form, their messages show up here.")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Clear filters" })).not.toBeInTheDocument()
  })
})

describe("/admin/messages/[id]", () => {
  it("404s for a malformed id without a lookup, and for an unknown one", async () => {
    await expect(renderMessage("nope")).rejects.toMatchObject(NOT_FOUND)
    expect(contact.getContactMessage).not.toHaveBeenCalled()

    await expect(renderMessage(ID)).rejects.toMatchObject(NOT_FOUND)
    expect(contact.getContactMessage).toHaveBeenCalledExactlyOnceWith(ID)
  })

  it("shows the message with the sender, a reply link, the order and status actions", async () => {
    contact.getContactMessage.mockResolvedValue({ ...message(), orderExists: true })

    await renderMessage(ID)

    expect(screen.getByRole("heading", { level: 1, name: "An order" })).toBeInTheDocument()
    expect(screen.getByText(/Where is my parcel\?\s+It's been a week\./)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Reply by email" })).toHaveAttribute(
      "href",
      "mailto:ada@example.com?subject=Re%3A%20An%20order",
    )
    expect(screen.getByText("Signed in when sending")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Their orders" })).toHaveAttribute("href", "/admin/orders?q=ada%40example.com")
    expect(screen.getByRole("link", { name: "NC-10001" })).toHaveAttribute("href", "/admin/orders/NC-10001")
    expect(screen.getByRole("button", { name: "Mark as read" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument()
  })

  it("marks a guest's order number that matches no order, and offers the right actions per status", async () => {
    contact.getContactMessage.mockResolvedValue({ ...message({ userId: null, status: "archived" }), orderExists: false })

    await renderMessage(ID)

    expect(screen.getByText("Sent as a guest")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Their orders" })).not.toBeInTheDocument()
    expect(screen.getByText("(no such order)")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Move to inbox" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument()
  })
})

describe("/admin/newsletter", () => {
  it("shows the counts, the export link and the subscribers", async () => {
    newsletter.getSubscriberCounts.mockResolvedValue({ subscribed: 3, unsubscribed: 1 })
    newsletter.listSubscribers.mockResolvedValue(
      page([
        {
          id: "s1",
          email: "ada@example.com",
          status: "subscribed",
          source: "register",
          createdAt: new Date("2026-09-01T10:00:00Z"),
          updatedAt: new Date("2026-09-01T10:00:00Z"),
        },
      ]),
    )

    await renderNewsletter({ status: "subscribed" })

    expect(newsletter.listSubscribers).toHaveBeenCalledWith({ status: "subscribed", q: undefined, page: 1, pageSize: 25 })
    expect(screen.getByRole("link", { name: "Export subscribed (CSV)" })).toHaveAttribute("href", "/api/admin/newsletter/export")
    const chips = within(screen.getByRole("navigation", { name: "Filter by status" })).getAllByRole("link")
    expect(chips.map((c) => c.textContent)).toEqual(["All4", "Subscribed3", "Unsubscribed1"])
    const table = screen.getByRole("table", { name: "Subscribers" })
    expect(within(table).getByText("ada@example.com")).toBeInTheDocument()
    expect(within(table).getByText("Registration")).toBeInTheDocument()
  })

  it("disables the export while nobody is subscribed", async () => {
    await renderNewsletter()

    expect(screen.getByRole("link", { name: "Export subscribed (CSV)" })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText("No subscribers")).toBeInTheDocument()
  })
})
