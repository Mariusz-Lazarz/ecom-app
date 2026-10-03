"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import * as z from "zod"

import { auth } from "@/auth"
import * as products from "@/lib/admin-products"
import { ADMIN_PRODUCTS_PATH } from "@/lib/admin-product-list"
import { AppError, ForbiddenError, GENERIC_MESSAGE, ValidationError, logError } from "@/lib/errors"
import { flash } from "@/lib/flash"
import { loginHref } from "@/lib/safe-redirect"
import { uploadImage } from "@/lib/storage"
import {
  PRODUCT_FORM_FIELDS,
  ProductFormSchema,
  productFieldErrors,
  type ProductFormField,
  type ProductFormState,
  type ProductFormValues,
} from "@/lib/validation/admin-products"

/**
 * Admin product Server Actions. Every call reads the session itself and re-checks the admin role:
 * signed-out callers are sent to /login, other users get a "no access" result. Expected failures
 * come back as field `errors` or a `message`; anything else is logged and reported generically.
 */

const NO_ACCESS = "You don't have access to this action."
const productId = z.uuid()

async function requireAdminAction(scope: string): Promise<string | null> {
  const session = await auth()
  if (!session?.user?.id) redirect(loginHref(ADMIN_PRODUCTS_PATH))
  if (session.user.role !== "admin") {
    logError(new ForbiddenError("Product change by a non-admin"), scope)
    return null
  }
  return session.user.id
}

function expectedMessage(err: unknown, scope: string) {
  logError(err, scope)
  return err instanceof AppError && err.status < 500 ? err.message : GENERIC_MESSAGE
}

function readValues(formData: FormData): ProductFormValues {
  const values: ProductFormValues = {}
  for (const field of PRODUCT_FORM_FIELDS) {
    if (field === "featured") continue
    const value = formData.get(field)
    if (typeof value === "string") values[field] = value
  }
  // A checkbox / switch posts its value only when on.
  values.featured = formData.has("featured")
  return values
}

function parseJsonList(value: string | undefined): unknown {
  if (!value) return []
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/**
 * Creates (`id` null) or updates a product from the product form. For
 * `useActionState(saveProduct.bind(null, id), …)`. On success it queues a toast, drops cached
 * pages so the storefront shows the change, and redirects to the product list; otherwise it
 * returns field `errors` or a `message` with the posted `values`.
 */
export async function saveProduct(
  id: string | null,
  _state: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const scope = id ? "admin-products.update" : "admin-products.create"
  if (!(await requireAdminAction(scope))) return { message: NO_ACCESS }
  if (id !== null && !productId.safeParse(id).success) return { message: "This product no longer exists." }

  const values = readValues(formData)
  const parsed = ProductFormSchema.safeParse({
    ...values,
    specs: parseJsonList(values.specs),
    images: parseJsonList(values.images),
  })
  if (!parsed.success) {
    return { errors: productFieldErrors(parsed.error), values, message: "Please check the highlighted fields." }
  }

  let saved: { id: string; slug: string }
  try {
    saved = id ? await products.updateProduct(id, parsed.data) : await products.createProduct(parsed.data)
  } catch (err) {
    if (err instanceof products.SlugTakenError) {
      logError(err, scope)
      return { errors: { slug: [err.message] }, values, message: "Please check the highlighted fields." }
    }
    if (err instanceof ValidationError) {
      logError(err, scope)
      return {
        errors: err.fieldErrors as Partial<Record<ProductFormField, string[]>>,
        values,
        message: "Please check the highlighted fields.",
      }
    }
    return { message: expectedMessage(err, scope), values }
  }

  await flash({
    type: "success",
    title: id ? "Product saved" : "Product created",
    description: `${parsed.data.name} (/products/${saved.slug})`,
  })
  // Product data shows up across the storefront (cards, pages, search): drop every cached page.
  revalidatePath("/", "layout")
  redirect(ADMIN_PRODUCTS_PATH)
}

export type DeleteProductResult = { ok: false; message: string }

/**
 * Deletes a product (admins only). On success it queues a toast and redirects to the product
 * list; otherwise it resolves to a `message`.
 */
export async function deleteProduct(id: string): Promise<DeleteProductResult> {
  const scope = "admin-products.delete"
  if (!(await requireAdminAction(scope))) return { ok: false, message: NO_ACCESS }
  if (!productId.safeParse(id).success) return { ok: false, message: "This product no longer exists." }

  let deleted: { name: string }
  try {
    deleted = await products.deleteProduct(id)
  } catch (err) {
    return { ok: false, message: expectedMessage(err, scope) }
  }

  await flash({ type: "success", title: "Product deleted", description: deleted.name })
  revalidatePath("/", "layout")
  redirect(ADMIN_PRODUCTS_PATH)
}

export type UploadProductImageResult =
  | { ok: true; image: { key: string; url: string; width: number; height: number } }
  | { ok: false; message: string }

/**
 * Stores one product photo (the `file` field) with `uploadImage(bytes, "products")`, which checks
 * type and size, and normalises it to WebP. Admins only. The product form keeps the returned key
 * and saves it with the product.
 */
export async function uploadProductImage(formData: FormData): Promise<UploadProductImageResult> {
  const scope = "admin-products.upload"
  if (!(await requireAdminAction(scope))) return { ok: false, message: NO_ACCESS }

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose an image to upload." }

  try {
    const stored = await uploadImage(new Uint8Array(await file.arrayBuffer()), "products")
    return { ok: true, image: { key: stored.key, url: stored.url, width: stored.width, height: stored.height } }
  } catch (err) {
    return { ok: false, message: expectedMessage(err, scope) }
  }
}
