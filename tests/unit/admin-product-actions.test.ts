import { beforeEach, describe, expect, it, vi } from "vitest"

import { BadRequestError, NotFoundError, ValidationError } from "@/lib/errors"

const session = vi.hoisted(() => ({ current: null as null | { user: { id?: string; role: "user" | "admin" } } }))
const products = vi.hoisted(() => ({
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
}))
const uploadImage = vi.fn()
const flash = vi.fn()
const revalidatePath = vi.fn()
const redirect = vi.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` })
})

vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => session.current }))
// The real module (for SlugTakenError) with its database functions mocked.
vi.mock("@/lib/admin-products", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin-products")>()),
  ...products,
}))
vi.mock("@/lib/storage", () => ({ uploadImage: (...args: unknown[]) => uploadImage(...args) }))
vi.mock("@/lib/flash", () => ({ flash: (...args: unknown[]) => flash(...args) }))
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }))
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }))

const { saveProduct, deleteProduct, uploadProductImage } = await import("@/app/actions/admin-products")
const { SlugTakenError } = await import("@/lib/admin-products")

const PRODUCT_ID = "5b0e7c1d-2a3f-4b5c-8d9e-0f1a2b3c4d5e"
const CATEGORY_ID = "2f1c9a4e-8b7d-4c3a-9e1f-0a2b3c4d5e6f"
const KEY = `products/${"c".repeat(32)}.webp`
const asGuest = () => (session.current = null)
const asUser = () => (session.current = { user: { id: "user-1", role: "user" } })
const asAdmin = () => (session.current = { user: { id: "admin-1", role: "admin" } })

const fields = {
  name: "Trail Mug",
  slug: "trail-mug",
  brand: "Halden",
  categoryId: CATEGORY_ID,
  shortDescription: "Enamel mug.",
  description: "A sturdy enamel mug.",
  price: "12.50",
  compareAt: "15",
  stock: "7",
  badge: "New",
  specs: JSON.stringify([{ label: "Volume", value: "350 ml" }]),
  images: JSON.stringify([{ key: KEY, width: 800, height: 600, alt: "" }]),
}

function form(values: Record<string, string | undefined>, featured = true) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) if (value !== undefined) data.set(key, value)
  if (featured) data.set("featured", "on")
  return data
}

const parsed = {
  name: "Trail Mug",
  slug: "trail-mug",
  brand: "Halden",
  categoryId: CATEGORY_ID,
  shortDescription: "Enamel mug.",
  description: "A sturdy enamel mug.",
  price: 1250,
  compareAt: 1500,
  stock: 7,
  badge: "New",
  featured: true,
  specs: [{ label: "Volume", value: "350 ml" }],
  images: [{ key: KEY, width: 800, height: 600, alt: "Trail Mug" }],
}

const REDIRECT_TO_LIST = { digest: "NEXT_REDIRECT;replace;/admin/products;307;" }
const NO_ACCESS = "You don't have access to this action."

beforeEach(() => {
  asGuest()
  for (const fn of Object.values(products)) fn.mockReset()
  uploadImage.mockReset()
  flash.mockReset()
  revalidatePath.mockReset()
  redirect.mockClear()
})

describe("saveProduct", () => {
  it("sends signed-out callers to the login and back to the product list", async () => {
    await expect(saveProduct(null, undefined, form(fields))).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/login?callbackUrl=%2Fadmin%2Fproducts;307;",
    })
    expect(products.createProduct).not.toHaveBeenCalled()
  })

  it("refuses non-admins without touching anything", async () => {
    asUser()

    expect(await saveProduct(null, undefined, form(fields))).toEqual({ message: NO_ACCESS })
    expect(await saveProduct(PRODUCT_ID, undefined, form(fields))).toEqual({ message: NO_ACCESS })
    expect(products.createProduct).not.toHaveBeenCalled()
    expect(products.updateProduct).not.toHaveBeenCalled()
    expect(flash).not.toHaveBeenCalled()
  })

  it("creates the product from parsed values, queues a toast, revalidates and redirects to the list", async () => {
    asAdmin()
    products.createProduct.mockResolvedValue({ id: PRODUCT_ID, slug: "trail-mug" })

    await expect(saveProduct(null, undefined, form(fields))).rejects.toMatchObject(REDIRECT_TO_LIST)

    expect(products.createProduct).toHaveBeenCalledExactlyOnceWith(parsed)
    expect(products.updateProduct).not.toHaveBeenCalled()
    expect(flash).toHaveBeenCalledExactlyOnceWith({
      type: "success",
      title: "Product created",
      description: "Trail Mug (/products/trail-mug)",
    })
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout")
  })

  it("updates an existing product; an unchecked switch means not featured", async () => {
    asAdmin()
    products.updateProduct.mockResolvedValue({ id: PRODUCT_ID, slug: "trail-mug" })

    await expect(saveProduct(PRODUCT_ID, undefined, form(fields, false))).rejects.toMatchObject(REDIRECT_TO_LIST)

    expect(products.updateProduct).toHaveBeenCalledExactlyOnceWith(PRODUCT_ID, { ...parsed, featured: false })
    expect(flash).toHaveBeenCalledWith(expect.objectContaining({ title: "Product saved" }))
  })

  it("returns field errors with the posted values when the form is invalid", async () => {
    asAdmin()
    const values = { ...fields, price: "10", compareAt: "9", name: "" }

    const state = await saveProduct(null, undefined, form(values))

    expect(state).toEqual({
      errors: {
        name: ["Name is required."],
        compareAt: ["Compare-at price must be higher than the price, or empty."],
      },
      values: { ...values, featured: true },
      message: "Please check the highlighted fields.",
    })
    expect(products.createProduct).not.toHaveBeenCalled()
    expect(flash).not.toHaveBeenCalled()
  })

  it("treats unreadable specs JSON as invalid rather than crashing", async () => {
    asAdmin()

    const state = await saveProduct(null, undefined, form({ ...fields, specs: "{not json" }))

    expect(state?.errors?.specs).toEqual(["Invalid input: expected array, received null"])
    expect(products.createProduct).not.toHaveBeenCalled()
  })

  it("maps a taken slug to the slug field", async () => {
    asAdmin()
    products.createProduct.mockRejectedValue(new SlugTakenError())

    const state = await saveProduct(null, undefined, form(fields))

    expect(state).toMatchObject({
      errors: { slug: ["Another product already uses this slug."] },
      values: { slug: "trail-mug" },
    })
    expect(redirect).not.toHaveBeenCalled()
  })

  it("maps a domain ValidationError to its fields", async () => {
    asAdmin()
    products.updateProduct.mockRejectedValue(new ValidationError({ categoryId: ["This category no longer exists."] }))

    const state = await saveProduct(PRODUCT_ID, undefined, form(fields))

    expect(state?.errors).toEqual({ categoryId: ["This category no longer exists."] })
  })

  it("reports an expected domain error's message and an unexpected one generically", async () => {
    asAdmin()
    products.updateProduct.mockRejectedValueOnce(new NotFoundError("This product no longer exists."))
    products.updateProduct.mockRejectedValueOnce(new Error("connection reset with secrets"))

    expect(await saveProduct(PRODUCT_ID, undefined, form(fields))).toMatchObject({
      message: "This product no longer exists.",
      values: { name: "Trail Mug" },
    })
    expect(await saveProduct(PRODUCT_ID, undefined, form(fields))).toMatchObject({
      message: "Something went wrong. Please try again.",
    })
    expect(flash).not.toHaveBeenCalled()
  })

  it("rejects an id that isn't a UUID before parsing anything", async () => {
    asAdmin()

    expect(await saveProduct("not-a-uuid", undefined, form(fields))).toEqual({ message: "This product no longer exists." })
    expect(products.updateProduct).not.toHaveBeenCalled()
  })
})

describe("deleteProduct", () => {
  it("refuses non-admins", async () => {
    asUser()

    expect(await deleteProduct(PRODUCT_ID)).toEqual({ ok: false, message: NO_ACCESS })
    expect(products.deleteProduct).not.toHaveBeenCalled()
  })

  it("sends signed-out callers to the login", async () => {
    await expect(deleteProduct(PRODUCT_ID)).rejects.toMatchObject({ message: "NEXT_REDIRECT" })
    expect(products.deleteProduct).not.toHaveBeenCalled()
  })

  it("deletes, queues a toast, revalidates and redirects to the list", async () => {
    asAdmin()
    products.deleteProduct.mockResolvedValue({ id: PRODUCT_ID, slug: "trail-mug", name: "Trail Mug" })

    await expect(deleteProduct(PRODUCT_ID)).rejects.toMatchObject(REDIRECT_TO_LIST)

    expect(products.deleteProduct).toHaveBeenCalledExactlyOnceWith(PRODUCT_ID)
    expect(flash).toHaveBeenCalledExactlyOnceWith({ type: "success", title: "Product deleted", description: "Trail Mug" })
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/", "layout")
  })

  it("reports a missing product and doesn't redirect", async () => {
    asAdmin()
    products.deleteProduct.mockRejectedValue(new NotFoundError("This product no longer exists."))

    expect(await deleteProduct(PRODUCT_ID)).toEqual({ ok: false, message: "This product no longer exists." })
    expect(redirect).not.toHaveBeenCalled()
  })

  it("rejects an id that isn't a UUID", async () => {
    asAdmin()

    expect(await deleteProduct("1; DROP TABLE products")).toEqual({ ok: false, message: "This product no longer exists." })
    expect(products.deleteProduct).not.toHaveBeenCalled()
  })
})

describe("uploadProductImage", () => {
  const fileForm = (bytes: number[] = [0xff, 0xd8, 0xff, 0x00]) => {
    const data = new FormData()
    data.set("file", new File([new Uint8Array(bytes)], "photo.jpg", { type: "image/jpeg" }))
    return data
  }

  it("refuses non-admins without uploading", async () => {
    asUser()

    expect(await uploadProductImage(fileForm())).toEqual({ ok: false, message: NO_ACCESS })
    expect(uploadImage).not.toHaveBeenCalled()
  })

  it("stores the bytes in the products folder and returns the key, URL and size", async () => {
    asAdmin()
    uploadImage.mockResolvedValue({
      key: KEY,
      url: `http://media/${KEY}`,
      contentType: "image/webp",
      width: 1200,
      height: 900,
      size: 1000,
      originalSize: 4,
    })

    const result = await uploadProductImage(fileForm())

    expect(result).toEqual({ ok: true, image: { key: KEY, url: `http://media/${KEY}`, width: 1200, height: 900 } })
    const [bytes, folder] = uploadImage.mock.calls[0]
    expect(Array.from(bytes as Uint8Array)).toEqual([0xff, 0xd8, 0xff, 0x00])
    expect(folder).toBe("products")
  })

  it.each([
    ["no file", new FormData()],
    ["an empty file", fileForm([])],
  ])("asks for an image when there is %s", async (_, data) => {
    asAdmin()

    expect(await uploadProductImage(data)).toEqual({ ok: false, message: "Choose an image to upload." })
    expect(uploadImage).not.toHaveBeenCalled()
  })

  it("passes on why the storage refused the image, and hides unexpected errors", async () => {
    asAdmin()
    uploadImage.mockRejectedValueOnce(new BadRequestError("Only JPEG, PNG, WebP and AVIF images are supported."))
    uploadImage.mockRejectedValueOnce(new Error("S3 down: secret endpoint"))

    expect(await uploadProductImage(fileForm())).toEqual({
      ok: false,
      message: "Only JPEG, PNG, WebP and AVIF images are supported.",
    })
    expect(await uploadProductImage(fileForm())).toEqual({ ok: false, message: "Something went wrong. Please try again." })
  })
})
