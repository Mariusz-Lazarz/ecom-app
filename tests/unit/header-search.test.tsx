import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { makeProduct } from "./fixtures/products"

const location = { pathname: "/", search: "" }
vi.mock("next/navigation", () => ({
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search),
}))

const { HeaderSearch, SUGGEST_DEBOUNCE_MS } = await import("@/components/header-search")

type Deferred = { url: string; signal: AbortSignal; resolve: (body: unknown, status?: number) => void }

// Each fetch stays pending until the test resolves it, so tests control the order responses arrive in.
let requests: Deferred[] = []
const fetchMockImpl = (input: string, init?: RequestInit) => {
  return new Promise<Response>((resolve) => {
    requests.push({
      url: input,
      signal: init!.signal!,
      resolve: (body, status = 200) => resolve(new Response(JSON.stringify(body), { status })),
    })
  })
}
const fetchMock = vi.fn(fetchMockImpl)

const list = (items: ReturnType<typeof makeProduct>[]) => ({
  items: JSON.parse(JSON.stringify(items)),
  page: 1,
  pageSize: 6,
  total: items.length,
  pageCount: 1,
})

const headphones = makeProduct({
  slug: "aria-headphones",
  name: "Aria ANC Headphones",
  brand: "Halden",
  category: { slug: "audio", name: "Audio" },
  priceCents: 19900,
})
const speaker = makeProduct({
  slug: "pulse-speaker",
  name: "Pulse Speaker",
  brand: "Corda",
  category: { slug: "audio", name: "Audio" },
  priceCents: 8950,
  compareAtCents: 12000,
  onSale: true,
  image: null,
})

async function openSearch() {
  const user = userEvent.setup()
  render(<HeaderSearch />)
  await user.click(screen.getByRole("button", { name: "Search" }))
  return { user, input: screen.getByRole("combobox", { name: "Search products" }) }
}

/** Types `text`, then waits for the debounced request it triggers. */
async function typeAndWaitForRequest(user: ReturnType<typeof userEvent.setup>, input: HTMLElement, text: string) {
  const before = requests.length
  await user.type(input, text)
  await waitFor(() => expect(requests.length).toBe(before + 1))
  return requests.at(-1)!
}

const respond = async (request: Deferred, body: unknown, status?: number) => {
  await act(async () => request.resolve(body, status))
}

describe("HeaderSearch live suggestions", () => {
  beforeEach(() => {
    requests = []
    fetchMock.mockClear()
    vi.stubGlobal("fetch", fetchMock)
    location.pathname = "/"
    location.search = ""
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("asks the API for six products once typing pauses, with the trimmed term", async () => {
    const { user, input } = await openSearch()

    // Measured rather than checked at a fixed moment, so a slow machine can't make this flaky.
    let lastKeystrokeAt = 0
    input.addEventListener("input", () => (lastKeystrokeAt = performance.now()))
    let requestedAt = 0
    fetchMock.mockImplementationOnce((url, init) => {
      requestedAt = performance.now()
      return fetchMockImpl(url, init)
    })

    await user.type(input, " ar")

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: SUGGEST_DEBOUNCE_MS * 4 })
    expect(requests[0].url).toBe("/api/products?q=ar&pageSize=6")
    // The request only went out once typing had paused for the debounce window.
    expect(requestedAt - lastKeystrokeAt).toBeGreaterThanOrEqual(SUGGEST_DEBOUNCE_MS - 5)
  })

  it("sends one request for a burst of keystrokes, for the final term", async () => {
    const { user, input } = await openSearch()

    const request = await typeAndWaitForRequest(user, input, "aria anc")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(request.url).toBe("/api/products?q=aria+anc&pageSize=6")
  })

  it("does not search below two characters and hides the suggestions again", async () => {
    const { user, input } = await openSearch()

    await user.type(input, "a")
    await new Promise((resolve) => setTimeout(resolve, SUGGEST_DEBOUNCE_MS * 2))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()

    await respond(await typeAndWaitForRequest(user, input, "r"), list([headphones]))
    expect(await screen.findByRole("listbox", { name: "Suggested products" })).toBeInTheDocument()

    await user.type(input, "{Backspace}")
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("lists each match as a link to its page with thumbnail, brand, category and price", async () => {
    const { user, input } = await openSearch()

    await respond(await typeAndWaitForRequest(user, input, "au"), list([headphones, speaker]))

    const listbox = await screen.findByRole("listbox", { name: "Suggested products" })
    const options = within(listbox).getAllByRole("option")
    expect(options).toHaveLength(2)
    expect(options.map((o) => [o.tagName, o.getAttribute("href")])).toEqual([
      ["A", "/products/aria-headphones"],
      ["A", "/products/pulse-speaker"],
    ])
    expect(options[0]).toHaveTextContent("Aria ANC Headphones")
    expect(options[0]).toHaveTextContent("Halden · Audio")
    expect(options[0]).toHaveTextContent("$199.00")
    expect(options[0].querySelector("img")).toHaveAttribute("src", expect.stringContaining("aria-headphones.webp"))
    // A sale item shows both prices; a product without a photo gets a placeholder, not a broken image.
    expect(options[1]).toHaveTextContent("$89.50")
    expect(options[1]).toHaveTextContent("Was $120.00")
    expect(options[1].querySelector("img")).toBeNull()
    expect(screen.getByRole("status")).toHaveTextContent("2 suggestions")
  })

  it("links to all results for the term", async () => {
    const { user, input } = await openSearch()

    await respond(await typeAndWaitForRequest(user, input, "aria"), list([headphones]))

    expect(await screen.findByRole("link", { name: /See all results for “aria”/ })).toHaveAttribute(
      "href",
      "/products?q=aria",
    )
  })

  it("keeps the catalogue filters in the all-results link on /products", async () => {
    location.pathname = "/products"
    location.search = "category=audio&sort=price-asc&page=2"
    const { user, input } = await openSearch()
    await user.clear(input)

    await respond(await typeAndWaitForRequest(user, input, "aria"), list([headphones]))

    expect(await screen.findByRole("link", { name: /See all results/ })).toHaveAttribute(
      "href",
      "/products?category=audio&sort=price-asc&q=aria",
    )
  })

  it("shows a searching state until the first response arrives", async () => {
    const { user, input } = await openSearch()

    const request = await typeAndWaitForRequest(user, input, "aria")

    expect(await screen.findByRole("status")).toHaveTextContent("Searching…")
    await respond(request, list([headphones]))
    expect(screen.getByRole("status")).toHaveTextContent("1 suggestion")
  })

  it("says so when nothing matches", async () => {
    const { user, input } = await openSearch()

    await respond(await typeAndWaitForRequest(user, input, "zzz"), list([]))

    expect(await screen.findByRole("status")).toHaveTextContent("No products match “zzz”.")
    expect(screen.queryAllByRole("option")).toHaveLength(0)
    expect(screen.getByRole("link", { name: /See all results for “zzz”/ })).toBeInTheDocument()
  })

  it("shows an error when the API fails", async () => {
    const { user, input } = await openSearch()

    await respond(await typeAndWaitForRequest(user, input, "aria"), { error: { code: "internal" } }, 500)

    expect(await screen.findByRole("status")).toHaveTextContent("Couldn't load suggestions")
    expect(screen.queryAllByRole("option")).toHaveLength(0)
  })

  it("aborts the previous request and ignores its late response", async () => {
    const { user, input } = await openSearch()

    const first = await typeAndWaitForRequest(user, input, "pu")
    const second = await typeAndWaitForRequest(user, input, "lse")
    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(false)
    expect(second.url).toBe("/api/products?q=pulse&pageSize=6")

    // The newer answer lands first, then the stale one: the list must keep the newer results.
    await respond(second, list([speaker]))
    await respond(first, list([headphones]))

    const listbox = await screen.findByRole("listbox")
    expect(within(listbox).getAllByRole("option").map((o) => o.getAttribute("href"))).toEqual([
      "/products/pulse-speaker",
    ])
  })

  it("moves through suggestions with the arrow keys and opens the highlighted one with Enter", async () => {
    const { user, input } = await openSearch()
    await respond(await typeAndWaitForRequest(user, input, "au"), list([headphones, speaker]))
    const options = within(await screen.findByRole("listbox")).getAllByRole("option")
    const clicked = vi.fn((event: MouseEvent) => event.preventDefault())
    options[1].addEventListener("click", clicked)

    await user.keyboard("{ArrowDown}")
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id)
    await user.keyboard("{ArrowDown}")
    expect(input).toHaveAttribute("aria-activedescendant", options[1].id)
    await user.keyboard("{ArrowUp}{ArrowDown}")
    expect(input).toHaveAttribute("aria-activedescendant", options[1].id)

    await user.keyboard("{Enter}")

    // Enter activates the highlighted product's link, and the search closes as its page opens.
    expect(clicked).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("search")).not.toBeInTheDocument()
  })

  it("submits the search form when Enter is pressed with nothing highlighted", async () => {
    const { user, input } = await openSearch()
    await respond(await typeAndWaitForRequest(user, input, "aria"), list([headphones]))
    await screen.findByRole("listbox")
    const form = screen.getByRole("search") as HTMLFormElement
    const submitted = vi.fn((event: SubmitEvent) => {
      event.preventDefault()
      return new FormData(form).get("q")
    })
    form.addEventListener("submit", submitted)

    await user.keyboard("{Enter}")

    expect(submitted).toHaveBeenCalledTimes(1)
    expect(submitted.mock.results[0].value).toBe("aria")
  })

  it("closes the search with Escape while suggestions are open", async () => {
    const { user, input } = await openSearch()
    await respond(await typeAndWaitForRequest(user, input, "aria"), list([headphones]))
    await screen.findByRole("listbox")

    await user.keyboard("{Escape}")

    await waitFor(() => expect(screen.queryByRole("search")).not.toBeInTheDocument())
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute("aria-expanded", "false")
  })

  it("closes the search when a suggestion is clicked", async () => {
    const { user, input } = await openSearch()
    await respond(await typeAndWaitForRequest(user, input, "aria"), list([headphones]))
    const option = await screen.findByRole("option", { name: /Aria ANC Headphones/ })
    option.addEventListener("click", (event) => event.preventDefault())

    await user.click(option)

    expect(screen.queryByRole("search")).not.toBeInTheDocument()
  })
})
