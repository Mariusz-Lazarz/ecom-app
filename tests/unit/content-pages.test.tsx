import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { returnFaqs, returnPolicy, returnSteps } from "@/lib/returns"

// SiteHeader is an async Server Component (reads the session) and has its own tests.
vi.mock("@/components/site-header", () => ({ SiteHeader: () => <header /> }))
vi.mock("server-only", () => ({}))
const pathname = vi.hoisted(() => ({ current: "/help/returns" }))
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }))
const findSubscriberByToken = vi.hoisted(() => vi.fn())
vi.mock("@/lib/newsletter", () => ({ findSubscriberByToken }))
vi.mock("@/app/actions/newsletter", () => ({ unsubscribeFromNewsletter: vi.fn() }))
vi.mock("next/server", () => ({ connection: async () => {} }))

const { default: ReturnsPage } = await import("@/app/help/returns/page")
const { default: AboutPage } = await import("@/app/about/page")
const { default: CareersPage } = await import("@/app/careers/page")
const { default: PrivacyPage } = await import("@/app/privacy/page")
const { default: TermsPage } = await import("@/app/terms/page")
const { default: UnsubscribePage } = await import("@/app/newsletter/unsubscribe/page")
const { HelpNav } = await import("@/components/help/help-nav")

const TOKEN = "Xf3k9_-abcdefghijklmnopqrstuvwxyzABCDEFGHIJ"

beforeEach(() => {
  pathname.current = "/help/returns"
  findSubscriberByToken.mockReset()
})

describe("HelpNav", () => {
  it.each([
    ["/help/shipping", "Shipping"],
    ["/help/returns", "Returns"],
    ["/help/payments", "Payments"],
    ["/help/contact", "Contact us"],
  ])("on %s marks %s as the current topic", (path, current) => {
    pathname.current = path
    render(<HelpNav />)

    const links = within(screen.getByRole("navigation", { name: "Help topics" })).getAllByRole("link")
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/help/shipping", "/help/returns", "/help/payments", "/help/contact"])
    expect(links.filter((l) => l.getAttribute("aria-current") === "page").map((l) => l.textContent)).toEqual([current])
  })
})

describe("Returns page", () => {
  it("states the 30-day policy and starts a return through the contact form", () => {
    render(<ReturnsPage />)

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Returns & refunds")
    expect(screen.getByText(`${returnPolicy.windowDays}-day free returns`)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Start a return" })).toHaveAttribute("href", "/help/contact?topic=returns")
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(
      expect.arrayContaining(returnSteps.map((step, i) => `${i + 1}. ${step.title}`)),
    )
  })

  it("answers the FAQ in an accordion, one question at a time", async () => {
    const user = userEvent.setup()
    render(<ReturnsPage />)

    const triggers = screen.getAllByRole("button", { expanded: false })
    expect(triggers.map((t) => t.textContent)).toEqual(returnFaqs.map((faq) => faq.question))

    await user.click(screen.getByRole("button", { name: returnFaqs[1].question }))
    expect(screen.getByRole("button", { name: returnFaqs[1].question })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText(returnFaqs[1].answer)).toBeVisible()
  })
})

describe("Company pages", () => {
  it("about tells the story and links to careers and contact", () => {
    render(<AboutPage />)

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Everyday goods, thoughtfully picked.")
    expect(screen.getByRole("link", { name: "Work with us" })).toHaveAttribute("href", "/careers")
    expect(screen.getByRole("link", { name: "Say hello" })).toHaveAttribute("href", "/help/contact")
  })

  it("careers lists the made-up roles and says there are no real positions", () => {
    render(<CareersPage />)

    expect(screen.getByText("No real positions: this is a demo store")).toBeInTheDocument()
    const roles = ["Senior Frontend Engineer", "Product Buyer, Audio & Tech", "Customer Care Specialist", "Warehouse Lead"]
    expect(screen.getAllByRole("article")).toHaveLength(roles.length)
    for (const role of roles) expect(screen.getByRole("article", { name: role })).toBeInTheDocument()
    expect(within(screen.getByRole("article", { name: "Warehouse Lead" })).getByText("San Francisco")).toBeInTheDocument()
  })

  it("privacy lists every cookie and storage key the site uses, and mentions Mailpit", () => {
    render(<PrivacyPage />)

    const table = screen.getByRole("table")
    expect(within(table).getAllByRole("rowheader").map((th) => th.textContent)).toEqual([
      "cart_id",
      "authjs.session-token",
      "authjs.csrf-token, authjs.callback-url",
      "flash",
      "theme",
    ])
    expect(screen.getByText(/caught by Mailpit/)).toBeInTheDocument()
    const contents = within(screen.getByRole("navigation", { name: "On this page" })).getAllByRole("link")
    for (const link of contents) {
      expect(document.getElementById(link.getAttribute("href")!.slice(1))).not.toBeNull()
    }
  })

  it("terms links to the help pages they rely on", () => {
    render(<TermsPage />)

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Terms of service")
    expect(screen.getByRole("link", { name: "returns page" })).toHaveAttribute("href", "/help/returns")
    expect(screen.getByRole("link", { name: "shipping page" })).toHaveAttribute("href", "/help/shipping")
  })
})

describe("Unsubscribe page", () => {
  const renderPage = async (token?: string) =>
    render(
      await UnsubscribePage({
        params: Promise.resolve({}),
        searchParams: Promise.resolve(token === undefined ? {} : { token }),
      }),
    )

  it("explains a missing or malformed token without a lookup", async () => {
    await renderPage()
    expect(screen.getByRole("alert")).toHaveTextContent("This link doesn't work")
    expect(findSubscriberByToken).not.toHaveBeenCalled()
  })

  it("explains an unknown token", async () => {
    findSubscriberByToken.mockResolvedValue(null)
    await renderPage(TOKEN)
    expect(findSubscriberByToken).toHaveBeenCalledExactlyOnceWith(TOKEN)
    expect(screen.getByRole("alert")).toHaveTextContent("isn't valid any more")
  })

  it("asks a subscriber to confirm with one click", async () => {
    findSubscriberByToken.mockResolvedValue({ email: "ada@example.com", status: "subscribed" })
    const { container } = await renderPage(TOKEN)
    expect(screen.getByRole("heading", { name: "Unsubscribe from the newsletter?" })).toBeInTheDocument()
    expect(screen.getByText("ada@example.com")).toBeInTheDocument()
    expect(container.querySelector('input[name="token"]')).toHaveValue(TOKEN)
    expect(screen.getByRole("button", { name: "Unsubscribe" })).toBeInTheDocument()
  })

  it("says so when the address is already unsubscribed", async () => {
    findSubscriberByToken.mockResolvedValue({ email: "ada@example.com", status: "unsubscribed" })
    await renderPage(TOKEN)
    expect(screen.getByRole("status")).toHaveTextContent("You're already unsubscribed")
    expect(screen.queryByRole("button", { name: "Unsubscribe" })).not.toBeInTheDocument()
  })
})
