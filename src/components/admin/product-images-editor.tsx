"use client"

import Image from "next/image"
import { useEffect, useId, useRef } from "react"
import { ArrowLeft, ArrowRight, CircleAlert, ImagePlus, Trash2 } from "lucide-react"

import { uploadProductImage } from "@/app/actions/admin-products"
import { moveItem } from "@/components/admin/specs-editor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { GENERIC_MESSAGE } from "@/lib/errors"
import { MAX_UPLOAD_BYTES, UPLOAD_IMAGE_TYPES } from "@/lib/media-limits"
import { cn } from "@/lib/utils"
import { MAX_ALT_LENGTH, MAX_IMAGES } from "@/lib/validation/admin-products"

export type ImageItem = {
  id: string
  // A blob: preview while uploading, then the stored image's public URL.
  url: string
  alt: string
  status: "uploading" | "ready" | "error"
  key?: string
  width?: number
  height?: number
  error?: string
  fileName?: string
}

let nextId = 0
const newId = () => `image-${++nextId}`

/** An image already stored with the product. */
export const storedImage = (image: { key: string; url: string; width: number; height: number; alt: string }): ImageItem => ({
  id: newId(),
  status: "ready",
  ...image,
})

/** Why a file can't be uploaded (the same type and size limits as `uploadImage`), or null. */
export function checkImageFile(file: { type: string; size: number }): string | null {
  if (!(UPLOAD_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Only JPEG, PNG, WebP and AVIF images are supported."
  }
  if (file.size === 0) return "The image is empty."
  if (file.size > MAX_UPLOAD_BYTES) return `Images can be at most ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`
  return null
}

type ProductImagesEditorProps = {
  images: ImageItem[]
  // Receives an updater, since uploads finish after other changes.
  onChange: (update: (images: ImageItem[]) => ImageItem[]) => void
  invalid?: boolean
}

/**
 * The product's photos: pick one or more files (checked here, previewed straight away and
 * uploaded one request each through `uploadProductImage`), edit alt text, reorder (the first one
 * is the primary image) and remove. Controlled; the form posts the uploaded ones as JSON.
 */
export function ProductImagesEditor({ images, onChange, invalid }: ProductImagesEditorProps) {
  const inputId = useId()
  // Object URLs created for previews, released when the editor goes away.
  const previews = useRef(new Set<string>())

  useEffect(() => {
    const urls = previews.current
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const patch = (id: string, changes: Partial<ImageItem>) =>
    onChange((list) => list.map((image) => (image.id === id ? { ...image, ...changes } : image)))

  async function upload(id: string, file: File) {
    const body = new FormData()
    body.set("file", file)
    try {
      const result = await uploadProductImage(body)
      if (result.ok) patch(id, { status: "ready", error: undefined, ...result.image })
      else patch(id, { status: "error", error: result.message })
    } catch {
      patch(id, { status: "error", error: GENERIC_MESSAGE })
    }
  }

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const room = Math.max(0, MAX_IMAGES - images.length)
    const added: ImageItem[] = []
    for (const file of Array.from(files).slice(0, room)) {
      const url = URL.createObjectURL(file)
      previews.current.add(url)
      const problem = checkImageFile(file)
      const item: ImageItem = {
        id: newId(),
        url,
        alt: "",
        fileName: file.name,
        status: problem ? "error" : "uploading",
        error: problem ?? undefined,
      }
      added.push(item)
      if (!problem) void upload(item.id, file)
    }
    onChange((list) => [...list, ...added])
  }

  const full = images.length >= MAX_IMAGES

  return (
    <div className="space-y-3">
      {images.length > 0 && (
        <ol aria-label="Images" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {images.map((image, index) => {
            const n = index + 1
            return (
              <li
                key={image.id}
                aria-label={`Image ${n}`}
                className={cn(
                  "overflow-hidden rounded-lg border bg-card",
                  image.status === "error" && "border-destructive/50",
                )}
              >
                <div className="relative aspect-[4/3] bg-muted">
                  <Image
                    src={image.url}
                    alt={image.alt || image.fileName || `Image ${n}`}
                    fill
                    sizes="(min-width: 1280px) 15vw, (min-width: 640px) 30vw, 90vw"
                    unoptimized={image.url.startsWith("blob:")}
                    className={cn("object-cover", image.status !== "ready" && "opacity-60")}
                  />
                  {index === 0 && image.status === "ready" && <Badge className="absolute top-2 left-2">Primary</Badge>}
                  {image.status === "uploading" && (
                    <span className="absolute inset-0 flex items-center justify-center gap-2 bg-background/40 text-sm font-medium">
                      <Spinner aria-hidden />
                      Uploading…
                    </span>
                  )}
                </div>
                <div className="space-y-2 p-2">
                  {image.status === "error" ? (
                    <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
                      <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
                      <span>
                        {image.fileName && <span className="font-medium">{image.fileName}: </span>}
                        {image.error}
                      </span>
                    </p>
                  ) : (
                    <Input
                      aria-label={`Image ${n} alt text`}
                      placeholder="Alt text (defaults to the name)"
                      value={image.alt}
                      maxLength={MAX_ALT_LENGTH}
                      onChange={(event) => patch(image.id, { alt: event.target.value })}
                      className="h-8"
                    />
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move image ${n} earlier`}
                        disabled={index === 0}
                        onClick={() => onChange((list) => moveItem(list, index, index - 1))}
                      >
                        <ArrowLeft />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move image ${n} later`}
                        disabled={index === images.length - 1}
                        onClick={() => onChange((list) => moveItem(list, index, index + 1))}
                      >
                        <ArrowRight />
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove image ${n}`}
                      onClick={() => onChange((list) => list.filter((item) => item.id !== image.id))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 data-icon="inline-start" />
                      Remove
                    </Button>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <label
        htmlFor={inputId}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center transition-colors hover:bg-muted/50",
          invalid && "border-destructive",
          full && "pointer-events-none opacity-50",
        )}
      >
        <ImagePlus aria-hidden className="size-6 text-muted-foreground" />
        <span className="text-sm font-medium">{images.length === 0 ? "Add images" : "Add more images"}</span>
        <span className="text-xs text-muted-foreground">
          JPEG, PNG, WebP or AVIF, up to {MAX_UPLOAD_BYTES / 1024 / 1024} MB each · {images.length}/{MAX_IMAGES}
        </span>
      </label>
      <input
        id={inputId}
        type="file"
        aria-label="Add images"
        accept={UPLOAD_IMAGE_TYPES.join(",")}
        multiple
        disabled={full}
        className="sr-only"
        onChange={(event) => {
          addFiles(event.target.files)
          // Let the same file be picked again after removing it.
          event.target.value = ""
        }}
      />
    </div>
  )
}
