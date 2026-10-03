"use client"

import Link from "next/link"
import { useActionState, useState, useTransition, type FormEvent } from "react"
import { CircleAlert, Star } from "lucide-react"

import { saveProduct } from "@/app/actions/admin-products"
import { ProductImagesEditor, storedImage, type ImageItem } from "@/components/admin/product-images-editor"
import { SpecsEditor, newSpecRow, type SpecRow } from "@/components/admin/specs-editor"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ADMIN_PRODUCTS_PATH } from "@/lib/admin-product-list"
import type { AdminProduct } from "@/lib/admin-products"
import {
  MAX_BADGE_LENGTH,
  MAX_BRAND_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SHORT_DESCRIPTION_LENGTH,
  MAX_SLUG_LENGTH,
  centsToDollars,
  slugify,
  type ProductFormField,
  type ProductFormState,
} from "@/lib/validation/admin-products"

export type EditableProduct = Pick<
  AdminProduct,
  | "id"
  | "slug"
  | "name"
  | "brand"
  | "categoryId"
  | "shortDescription"
  | "description"
  | "priceCents"
  | "compareAtCents"
  | "stock"
  | "rating"
  | "reviewCount"
  | "badge"
  | "featured"
  | "specs"
  | "images"
>

type ProductFormProps = {
  // null for a new product.
  product: EditableProduct | null
  categories: { id: string; name: string }[]
}

const asErrors = (messages?: string[]) => messages?.map((message) => ({ message }))

/**
 * Creates or edits a product through `saveProduct`. Text fields are uncontrolled, except the name
 * and slug: a new product's slug follows the name until it's edited by hand. Prices are typed in
 * dollars (the action stores cents). Specs and images are edited in place and posted as JSON; the
 * form can't be saved while images are still uploading. Server-side errors show inline and every
 * typed value stays; a successful save redirects to the list with a toast.
 */
export function ProductForm({ product, categories }: ProductFormProps) {
  const [action] = useState(() => saveProduct.bind(null, product?.id ?? null))
  const [state, dispatch, saving] = useActionState<ProductFormState, FormData>(action, undefined)
  const [, startTransition] = useTransition()

  const [name, setName] = useState(product?.name ?? "")
  const [slug, setSlug] = useState(product?.slug ?? "")
  // An existing product keeps its URL unless the slug is changed on purpose.
  const [slugEdited, setSlugEdited] = useState(product !== null)
  const [specs, setSpecs] = useState<SpecRow[]>(() =>
    (product?.specs ?? []).map((spec) => newSpecRow(spec.label, spec.value)),
  )
  const [images, setImages] = useState<ImageItem[]>(() => (product?.images ?? []).map(storedImage))

  const uploading = images.some((image) => image.status === "uploading")
  const errors: Partial<Record<ProductFormField, string[]>> = state?.errors ?? {}
  const invalid = (field: ProductFormField) => (errors[field] ? true : undefined)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // Dispatching ourselves (rather than <form action>) keeps every typed value: React resets a
    // form after its action runs.
    event.preventDefault()
    if (uploading) return
    const formData = new FormData(event.currentTarget)
    startTransition(() => dispatch(formData))
  }

  const specsJson = JSON.stringify(specs.map(({ label, value }) => ({ label, value })))
  const imagesJson = JSON.stringify(
    images
      .filter((image) => image.status === "ready")
      .map(({ key, width, height, alt }) => ({ key, width, height, alt })),
  )
  const failedUploads = images.filter((image) => image.status === "error").length

  return (
    <form onSubmit={onSubmit} noValidate aria-label={product ? "Edit product" : "New product"} className="space-y-6">
      <input type="hidden" name="specs" value={specsJson} />
      <input type="hidden" name="images" value={imagesJson} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup className="gap-5">
                <Field data-invalid={invalid("name")}>
                  <FieldLabel htmlFor="product-name">Name</FieldLabel>
                  <Input
                    id="product-name"
                    name="name"
                    value={name}
                    maxLength={MAX_NAME_LENGTH}
                    onChange={(event) => {
                      setName(event.target.value)
                      if (!slugEdited) setSlug(slugify(event.target.value))
                    }}
                    aria-invalid={invalid("name")}
                  />
                  <FieldError errors={asErrors(errors.name)} />
                </Field>
                <Field data-invalid={invalid("slug")}>
                  <FieldLabel htmlFor="product-slug">Slug</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon>
                      <InputGroupText>/products/</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id="product-slug"
                      name="slug"
                      value={slug}
                      maxLength={MAX_SLUG_LENGTH}
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(event) => {
                        setSlug(event.target.value)
                        setSlugEdited(true)
                      }}
                      aria-invalid={invalid("slug")}
                    />
                  </InputGroup>
                  <FieldDescription>
                    {slugEdited ? "Lower-case letters, digits and dashes; unique." : "Follows the name until you edit it."}
                  </FieldDescription>
                  <FieldError errors={asErrors(errors.slug)} />
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field data-invalid={invalid("brand")}>
                    <FieldLabel htmlFor="product-brand">Brand</FieldLabel>
                    <Input
                      id="product-brand"
                      name="brand"
                      defaultValue={product?.brand}
                      maxLength={MAX_BRAND_LENGTH}
                      aria-invalid={invalid("brand")}
                    />
                    <FieldError errors={asErrors(errors.brand)} />
                  </Field>
                  <Field data-invalid={invalid("categoryId")}>
                    <FieldLabel id="product-category-label">Category</FieldLabel>
                    <Select<string>
                      name="categoryId"
                      items={categories.map((category) => ({ value: category.id, label: category.name }))}
                      defaultValue={product?.categoryId ?? null}
                    >
                      <SelectTrigger
                        aria-labelledby="product-category-label"
                        aria-invalid={invalid("categoryId")}
                        className="w-full"
                      >
                        <SelectValue placeholder="Choose a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError errors={asErrors(errors.categoryId)} />
                  </Field>
                </div>
                <Field data-invalid={invalid("shortDescription")}>
                  <FieldLabel htmlFor="product-short-description">Short description</FieldLabel>
                  <Textarea
                    id="product-short-description"
                    name="shortDescription"
                    rows={2}
                    defaultValue={product?.shortDescription}
                    maxLength={MAX_SHORT_DESCRIPTION_LENGTH}
                    aria-invalid={invalid("shortDescription")}
                  />
                  <FieldDescription>One or two sentences for product cards and search.</FieldDescription>
                  <FieldError errors={asErrors(errors.shortDescription)} />
                </Field>
                <Field data-invalid={invalid("description")}>
                  <FieldLabel htmlFor="product-description">Description</FieldLabel>
                  <Textarea
                    id="product-description"
                    name="description"
                    rows={6}
                    defaultValue={product?.description}
                    maxLength={MAX_DESCRIPTION_LENGTH}
                    aria-invalid={invalid("description")}
                  />
                  <FieldError errors={asErrors(errors.description)} />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Images</CardTitle>
              <CardDescription>The first image is the primary one, shown on product cards.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ProductImagesEditor images={images} onChange={setImages} invalid={invalid("images")} />
              <FieldError errors={asErrors(errors.images)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Specifications</CardTitle>
              <CardDescription>Shown as a table on the product page, in this order.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SpecsEditor specs={specs} onChange={setSpecs} invalid={invalid("specs")} />
              <FieldError errors={asErrors(errors.specs)} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup className="gap-5">
                <Field data-invalid={invalid("price")}>
                  <FieldLabel htmlFor="product-price">Price</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon>
                      <InputGroupText>$</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id="product-price"
                      name="price"
                      inputMode="decimal"
                      placeholder="0.00"
                      defaultValue={product ? centsToDollars(product.priceCents) : undefined}
                      aria-invalid={invalid("price")}
                    />
                  </InputGroup>
                  <FieldError errors={asErrors(errors.price)} />
                </Field>
                <Field data-invalid={invalid("compareAt")}>
                  <FieldLabel htmlFor="product-compare-at">Compare-at price</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon>
                      <InputGroupText>$</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id="product-compare-at"
                      name="compareAt"
                      inputMode="decimal"
                      placeholder="Optional"
                      defaultValue={
                        product?.compareAtCents != null ? centsToDollars(product.compareAtCents) : undefined
                      }
                      aria-invalid={invalid("compareAt")}
                    />
                  </InputGroup>
                  <FieldDescription>The “was” price. Above the price puts the product on sale.</FieldDescription>
                  <FieldError errors={asErrors(errors.compareAt)} />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inventory</CardTitle>
            </CardHeader>
            <CardContent>
              <Field data-invalid={invalid("stock")}>
                <FieldLabel htmlFor="product-stock">Stock</FieldLabel>
                <Input
                  id="product-stock"
                  name="stock"
                  inputMode="numeric"
                  defaultValue={product ? String(product.stock) : "0"}
                  aria-invalid={invalid("stock")}
                />
                <FieldError errors={asErrors(errors.stock)} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Merchandising</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup className="gap-5">
                <Field orientation="horizontal">
                  <Switch id="product-featured" name="featured" defaultChecked={product?.featured ?? false} />
                  <FieldLabel htmlFor="product-featured">Featured on the home page</FieldLabel>
                </Field>
                <Field data-invalid={invalid("badge")}>
                  <FieldLabel htmlFor="product-badge">Badge</FieldLabel>
                  <Input
                    id="product-badge"
                    name="badge"
                    defaultValue={product?.badge ?? undefined}
                    maxLength={MAX_BADGE_LENGTH}
                    placeholder="e.g. New, Bestseller"
                    aria-invalid={invalid("badge")}
                  />
                  <FieldDescription>Optional label on the product card.</FieldDescription>
                  <FieldError errors={asErrors(errors.badge)} />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reviews</CardTitle>
              <CardDescription>Read-only: they come from customer reviews.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="flex items-center gap-1.5 text-sm" data-testid="product-reviews">
                <Star aria-hidden className="size-4 fill-amber-400 text-amber-400" />
                <span className="font-medium tabular-nums">{(product?.rating ?? 0).toFixed(1)}</span>
                <span className="text-muted-foreground">
                  · {product?.reviewCount ?? 0} {product?.reviewCount === 1 ? "review" : "reviews"}
                </span>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/90 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/70 sm:mx-0 sm:rounded-xl sm:border">
        {state?.message && (
          <Alert variant="destructive" className="mb-3">
            <CircleAlert />
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {(uploading || failedUploads > 0) && (
            <p className="mr-auto text-sm text-muted-foreground" aria-live="polite">
              {uploading
                ? "Waiting for images to finish uploading…"
                : `${failedUploads} ${failedUploads === 1 ? "image" : "images"} failed and won't be saved.`}
            </p>
          )}
          <Link href={ADMIN_PRODUCTS_PATH} className={buttonVariants({ variant: "outline" })}>
            Cancel
          </Link>
          <Button type="submit" disabled={saving || uploading}>
            {saving && <Spinner data-icon="inline-start" aria-hidden />}
            {saving ? "Saving…" : product ? "Save changes" : "Create product"}
          </Button>
        </div>
      </div>
    </form>
  )
}
