"use client"

import Image from "next/image"
import { useState } from "react"
import { ImageOff } from "lucide-react"

import type { ProductImage } from "@/lib/products"
import { cn } from "@/lib/utils"

/** The main product photo with a row of thumbnails that switch it. */
export function ProductGallery({ images, productName }: { images: ProductImage[]; productName: string }) {
  const [selected, setSelected] = useState(0)
  const current = images[selected]

  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
        {current ? (
          <Image
            key={current.url}
            src={current.url}
            alt={current.alt}
            fill
            loading="eager"
            fetchPriority="high"
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-10" />
            <span className="sr-only">No photo of {productName}</span>
          </span>
        )}
      </div>
      {images.length > 1 && (
        <ul className="grid grid-cols-4 gap-3 sm:grid-cols-5">
          {images.map((image, index) => (
            <li key={image.url}>
              <button
                type="button"
                onClick={() => setSelected(index)}
                aria-label={`Show photo ${index + 1} of ${images.length}`}
                aria-pressed={index === selected}
                className={cn(
                  "relative block aspect-square w-full cursor-pointer overflow-hidden rounded-lg bg-muted ring-offset-2 ring-offset-background outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  index === selected ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100",
                )}
              >
                <Image src={image.url} alt="" fill sizes="120px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
