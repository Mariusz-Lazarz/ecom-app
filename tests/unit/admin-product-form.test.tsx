import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { ProductFormState } from "@/lib/validation/admin-products"

const saveProduct = vi.fn<(id: string | null, state: ProductFormState, formData: FormData) => Promise<ProductFormState>>()
const uploadProductImage = vi.fn()

vi.mock("@/app/actions/admin-products", () => ({
  saveProduct: (id: string | null, state: ProductFormState, formData: FormData) => saveProduct(id, state, formData),
  uploadProductImage: (formData: FormData) => uploadProductImage(formData),
  deleteProduct: vi.fn(),
}))

const { ProductForm } = await import("@/components/admin/product-form")
const { checkImageFile } = await import("@/components/admin/product-images-editor")

const PRODUCT_ID = "5b0e7c1d-2a3f-4b5c-8d9e-0f1a2b3c4d5e"
const categories = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Audio" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Home & Kitchen" },
]
const KEY_A = `products/${"a".repeat(32)}.webp`
const KEY_B = `products/${"b".repeat(32)}.webp`

const product = {
  id: PRODUCT_ID,
  slug: "trail-mug",
  name: "Trail Mug",
  brand: "Halden",
  categoryId: categories[1].id,
  shortDescription: "Enamel mug.",
  description: "A sturdy enamel mug.",
  priceCents: 1250,
  compareAtCents: 1999,
  stock: 7,
  rating: 4.6,
  reviewCount: 12,
  badge: "New",
  featured: true,
  specs: [
    { label: "Volume", value: "350 ml" },
    { label: "Material", value: "Steel" },
    { label: "Weight", value: "250 g" },
  ],
  images: [
    { key: KEY_A, url: `http://localhost:9090/media/${KEY_A}`, width: 800, height: 600, alt: "Front" },
    { key: KEY_B, url: `http://localhost:9090/media/${KEY_B}`, width: 800, height: 600, alt: "Side" },
  ],
}

/** The FormData of the last save. */
const posted = () => saveProduct.mock.lastCall![2]
const postedJson = (field: string) => JSON.parse(String(posted().get(field)))
const specRows = () =>
  within(screen.getByRole("list", { name: "Specs" }))
    .getAllByRole("listitem")
    .map((row) => within(row).getAllByRole("textbox").map((input) => (input as HTMLInputElement).value))

let objectUrls = 0
beforeAll(() => {
  URL.createObjectURL = vi.fn(() => `blob:preview-${++objectUrls}`)
  URL.revokeObjectURL = vi.fn()
})
afterAll(() => {
  // @ts-expect-error jsdom doesn't define these
  delete URL.createObjectURL
  // @ts-expect-error jsdom doesn't define these
  delete URL.revokeObjectURL
})

beforeEach(() => {
  saveProduct.mockReset().mockResolvedValue(undefined)
  uploadProductImage.mockReset()
})

describe("ProductForm: new product", () => {
  it("derives the slug from the name until the slug is edited", async () => {
    const user = userEvent.setup()
    render(<ProductForm product={null} categories={categories} />)

    await user.type(screen.getByLabelText("Name"), "Café Trail Mug")
    expect(screen.getByLabelText("Slug")).toHaveValue("cafe-trail-mug")

    await user.clear(screen.getByLabelText("Slug"))
    await user.type(screen.getByLabelText("Slug"), "my-mug")
    await user.type(screen.getByLabelText("Name"), " XL")
    expect(screen.getByLabelText("Slug")).toHaveValue("my-mug")
  })

  it("starts with 0 stock, no specs or images and a Create button", () => {
    render(<ProductForm product={null} categories={categories} />)

    expect(screen.getByLabelText("Stock")).toHaveValue("0")
    expect(screen.getByText(/No specs yet/)).toBeInTheDocument()
    expect(screen.queryByRole("list", { name: "Images" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create product" })).toBeEnabled()
    expect(screen.getByTestId("product-reviews")).toHaveTextContent("0.0· 0 reviews")
  })

  it("posts the typed values with a null id, prices in dollars as typed", async () => {
    const user = userEvent.setup()
    render(<ProductForm product={null} categories={categories} />)

    await user.type(screen.getByLabelText("Name"), "Trail Mug")
    await user.type(screen.getByLabelText("Brand"), "Halden")
    await user.type(screen.getByLabelText("Price"), "12.5")
    await user.click(screen.getByRole("button", { name: "Create product" }))

    await waitFor(() => expect(saveProduct).toHaveBeenCalledTimes(1))
    expect(saveProduct.mock.lastCall![0]).toBeNull()
    const data = posted()
    expect(data.get("name")).toBe("Trail Mug")
    expect(data.get("slug")).toBe("trail-mug")
    expect(data.get("brand")).toBe("Halden")
    expect(data.get("price")).toBe("12.5")
    expect(data.get("compareAt")).toBe("")
    expect(data.get("stock")).toBe("0")
    expect(data.has("featured")).toBe(false)
    expect(postedJson("specs")).toEqual([])
    expect(postedJson("images")).toEqual([])
  })

  it("shows the server's field errors inline and keeps every typed value", async () => {
    const user = userEvent.setup()
    saveProduct.mockResolvedValue({
      errors: {
        slug: ["Another product already uses this slug."],
        compareAt: ["Compare-at price must be higher than the price, or empty."],
        specs: ["Row 1: Label is required."],
      },
      message: "Please check the highlighted fields.",
    })
    render(<ProductForm product={null} categories={categories} />)

    await user.type(screen.getByLabelText("Name"), "Trail Mug")
    await user.type(screen.getByLabelText("Description"), "Long text")
    await user.type(screen.getByLabelText("Price"), "20")
    await user.type(screen.getByLabelText("Compare-at price"), "10")
    await user.click(screen.getByRole("button", { name: "Add spec" }))
    await user.type(screen.getByLabelText("Spec 1 value"), "350 ml")
    await user.click(screen.getByRole("button", { name: "Create product" }))

    expect(await screen.findByText("Another product already uses this slug.")).toBeInTheDocument()
    expect(screen.getByText("Compare-at price must be higher than the price, or empty.")).toBeInTheDocument()
    expect(screen.getByText("Row 1: Label is required.")).toBeInTheDocument()
    expect(screen.getByText("Please check the highlighted fields.")).toBeInTheDocument()
    expect(screen.getByLabelText("Slug")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Compare-at price")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("Price")).not.toHaveAttribute("aria-invalid")
    expect(screen.getByLabelText("Spec 1 label")).toHaveAttribute("aria-invalid", "true")

    expect(screen.getByLabelText("Name")).toHaveValue("Trail Mug")
    expect(screen.getByLabelText("Slug")).toHaveValue("trail-mug")
    expect(screen.getByLabelText("Description")).toHaveValue("Long text")
    expect(screen.getByLabelText("Price")).toHaveValue("20")
    expect(screen.getByLabelText("Compare-at price")).toHaveValue("10")
    expect(screen.getByLabelText("Spec 1 value")).toHaveValue("350 ml")
  })
})

describe("ProductForm: existing product", () => {
  it("shows the stored values with prices converted from cents to dollars", () => {
    render(<ProductForm product={product} categories={categories} />)

    expect(screen.getByLabelText("Name")).toHaveValue("Trail Mug")
    expect(screen.getByLabelText("Slug")).toHaveValue("trail-mug")
    expect(screen.getByLabelText("Price")).toHaveValue("12.50")
    expect(screen.getByLabelText("Compare-at price")).toHaveValue("19.99")
    expect(screen.getByLabelText("Stock")).toHaveValue("7")
    expect(screen.getByLabelText("Badge")).toHaveValue("New")
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveTextContent("Home & Kitchen")
    expect(screen.getByTestId("product-reviews")).toHaveTextContent("4.6· 12 reviews")
    expect(specRows()).toEqual([
      ["Volume", "350 ml"],
      ["Material", "Steel"],
      ["Weight", "250 g"],
    ])
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument()
  })

  it("keeps the slug when the name changes", async () => {
    const user = userEvent.setup()
    render(<ProductForm product={product} categories={categories} />)

    await user.type(screen.getByLabelText("Name"), " XL")
    expect(screen.getByLabelText("Slug")).toHaveValue("trail-mug")
  })

  it("posts with the product id, the category, featured and an empty compare-at when cleared", async () => {
    const user = userEvent.setup()
    render(<ProductForm product={product} categories={categories} />)

    await user.clear(screen.getByLabelText("Compare-at price"))
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => expect(saveProduct).toHaveBeenCalledTimes(1))
    expect(saveProduct.mock.lastCall![0]).toBe(PRODUCT_ID)
    expect(posted().get("categoryId")).toBe(categories[1].id)
    expect(posted().get("price")).toBe("12.50")
    expect(posted().get("compareAt")).toBe("")
    expect(posted().get("featured")).toBe("on")
    expect(posted().get("badge")).toBe("New")
  })

  it("doesn't post featured once the switch is off", async () => {
    const user = userEvent.setup()
    render(<ProductForm product={product} categories={categories} />)

    await user.click(screen.getByRole("switch"))
    await user.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() => expect(saveProduct).toHaveBeenCalledTimes(1))
    expect(posted().has("featured")).toBe(false)
  })
})

describe("specs editor", () => {
  it("adds, edits, removes and reorders rows, and posts them in order", async () => {
    const user = userEvent.setup()
    render(<ProductForm product={product} categories={categories} />)

    // Move Weight to the top, Volume down one.
    await user.click(screen.getByRole("button", { name: "Move spec 3 up" }))
    await user.click(screen.getByRole("button", { name: "Move spec 2 up" }))
    expect(specRows()).toEqual([
      ["Weight", "250 g"],
      ["Volume", "350 ml"],
      ["Material", "Steel"],
    ])
    await user.click(screen.getByRole("button", { name: "Move spec 1 down" }))
    expect(specRows().map(([label]) => label)).toEqual(["Volume", "Weight", "Material"])

    await user.click(screen.getByRole("button", { name: "Remove spec 3" }))
    await user.click(screen.getByRole("button", { name: "Add spec" }))
    await user.type(screen.getByLabelText("Spec 3 label"), "Colour")
    await user.type(screen.getByLabelText("Spec 3 value"), "Green")

    await user.click(screen.getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(saveProduct).toHaveBeenCalledTimes(1))
    expect(postedJson("specs")).toEqual([
      { label: "Volume", value: "350 ml" },
      { label: "Weight", value: "250 g" },
      { label: "Colour", value: "Green" },
    ])
  })

  it("disables moving the first row up and the last row down", () => {
    render(<ProductForm product={product} categories={categories} />)

    expect(screen.getByRole("button", { name: "Move spec 1 up" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Move spec 1 down" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Move spec 3 down" })).toBeDisabled()
  })

  it("shows the empty state after removing every row", async () => {
    const user = userEvent.setup()
    render(<ProductForm product={{ ...product, specs: [{ label: "Volume", value: "350 ml" }] }} categories={categories} />)

    await user.click(screen.getByRole("button", { name: "Remove spec 1" }))
    expect(screen.queryByRole("list", { name: "Specs" })).not.toBeInTheDocument()
    expect(screen.getByText(/No specs yet/)).toBeInTheDocument()
  })
})

describe("images editor", () => {
  const imageNames = () =>
    within(screen.getByRole("list", { name: "Images" }))
      .getAllByRole("listitem")
      .map((item) => within(item).getByRole("img").getAttribute("alt"))

  it("lists the stored images, primary first, with editable alt text, reorder and remove", async () => {
    const user = userEvent.setup()
    render(<ProductForm product={product} categories={categories} />)

    expect(imageNames()).toEqual(["Front", "Side"])
    expect(within(screen.getByRole("listitem", { name: "Image 1" })).getByText("Primary")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Move image 2 earlier" }))
    expect(imageNames()).toEqual(["Side", "Front"])
    await user.clear(screen.getByLabelText("Image 2 alt text"))
    await user.type(screen.getByLabelText("Image 2 alt text"), "Front view")

    await user.click(screen.getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(saveProduct).toHaveBeenCalledTimes(1))
    expect(postedJson("images")).toEqual([
      { key: KEY_B, width: 800, height: 600, alt: "Side" },
      { key: KEY_A, width: 800, height: 600, alt: "Front view" },
    ])

    await user.click(screen.getByRole("button", { name: "Remove image 1" }))
    await user.click(screen.getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(saveProduct).toHaveBeenCalledTimes(2))
    expect(postedJson("images")).toEqual([{ key: KEY_A, width: 800, height: 600, alt: "Front view" }])
  })

  it("uploads picked files, blocks saving until done, then posts the uploaded image last", async () => {
    const user = userEvent.setup()
    let finish!: (value: unknown) => void
    uploadProductImage.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const KEY_C = `products/${"c".repeat(32)}.webp`
    render(<ProductForm product={product} categories={categories} />)

    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "mug.jpg", { type: "image/jpeg" })
    await user.upload(screen.getByLabelText("Add images"), file)

    expect(screen.getByText("Uploading…")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled()
    expect(screen.getByText("Waiting for images to finish uploading…")).toBeInTheDocument()
    const sent = uploadProductImage.mock.lastCall![0] as FormData
    expect(sent.get("file")).toBe(file)

    await act(async () =>
      finish({ ok: true, image: { key: KEY_C, url: `http://localhost:9090/media/${KEY_C}`, width: 640, height: 480 } }),
    )
    expect(screen.queryByText("Uploading…")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled()

    await user.click(screen.getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(saveProduct).toHaveBeenCalledTimes(1))
    expect(postedJson("images").map((image: { key: string }) => image.key)).toEqual([KEY_A, KEY_B, KEY_C])
    expect(postedJson("images")[2]).toEqual({ key: KEY_C, width: 640, height: 480, alt: "" })
  })

  it("rejects files of the wrong type without uploading and doesn't post them", async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<ProductForm product={{ ...product, images: [] }} categories={categories} />)

    await user.upload(screen.getByLabelText("Add images"), new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }))

    expect(screen.getByRole("alert")).toHaveTextContent("logo.svg: Only JPEG, PNG, WebP and AVIF images are supported.")
    expect(uploadProductImage).not.toHaveBeenCalled()
    expect(screen.getByText("1 image failed and won't be saved.")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(saveProduct).toHaveBeenCalledTimes(1))
    expect(postedJson("images")).toEqual([])
  })

  it("shows the server's reason when an upload fails", async () => {
    const user = userEvent.setup()
    uploadProductImage.mockResolvedValue({ ok: false, message: "The image couldn't be read." })
    render(<ProductForm product={{ ...product, images: [] }} categories={categories} />)

    await user.upload(screen.getByLabelText("Add images"), new File([new Uint8Array([1])], "bad.png", { type: "image/png" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("bad.png: The image couldn't be read.")
  })
})

describe("checkImageFile", () => {
  const MB = 1024 * 1024
  it.each([
    ["image/jpeg", 1, null],
    ["image/png", 10 * MB, null],
    ["image/webp", 10 * MB + 1, "Images can be at most 10 MB."],
    ["image/avif", 0, "The image is empty."],
    ["image/gif", 100, "Only JPEG, PNG, WebP and AVIF images are supported."],
    ["", 100, "Only JPEG, PNG, WebP and AVIF images are supported."],
  ])("%s of %d bytes → %s", (type, size, expected) => {
    expect(checkImageFile({ type, size })).toBe(expected)
  })
})
