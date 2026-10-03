"use client"

import Image from "next/image"
import { useState } from "react"
import { ImageOff } from "lucide-react"

import { Toggle } from "@/components/ui/toggle"
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
              <Toggle
                pressed={index === selected}
                onPressedChange={() => setSelected(index)}
                aria-label={`Show photo ${index + 1} of ${images.length}`}
                className={cn(
                  "relative block aspect-square h-auto w-full cursor-pointer overflow-hidden rounded-lg bg-muted p-0 ring-offset-2 ring-offset-background",
                  index === selected ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100",
                )}
              >
                <Image src={image.url} alt="" fill sizes="120px" className="object-cover" />
              </Toggle>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
