import { createHash } from "node:crypto"

import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// Runs the real upload pipeline against the S3 emulator from docker compose, then fetches every
// object back from its public URL, the way a browser or CDN would.
if (!process.env.S3_ENDPOINT) process.loadEnvFile(".env.local")

const { checkStorage, deleteMedia, listMedia, mediaUrl, uploadImage } = await import("@/lib/storage")
const { BadRequestError } = await import("@/lib/errors")

// Each run writes to its own folder, so runs never see each other's objects.
const folder = `test-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// What a phone uploads: a 12 MP JPEG of several MB, with camera EXIF and GPS coordinates.
function phonePhoto() {
  const width = 4000
  const height = 3000
  const raw = Buffer.alloc(width * height * 3)
  for (let i = 0; i < raw.length; i += 3) {
    const x = (i / 3) % width
    const y = Math.floor(i / 3 / width)
    const grain = ((i * 7919) % 41) - 20
    raw[i] = (x / width) * 200 + grain
    raw[i + 1] = (y / height) * 200 + grain
    raw[i + 2] = 120 + grain
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 92 })
    .withExif({ IFD0: { Make: "Phone" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "52/1 13/1 0/1" } })
    .toBuffer()
}

const transparentPng = () =>
  sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png()
    .toBuffer()

beforeAll(async () => {
  await checkStorage()
})

afterAll(async () => {
  for (const object of await listMedia(`${folder}/`)) await deleteMedia(object.key)
})

describe("media storage (S3 emulator)", () => {
  it("stores a phone photo resized, compressed, stripped of GPS and publicly cacheable", async () => {
    const jpeg = await phonePhoto()
    expect(jpeg.length).toBeGreaterThan(3 * 1024 * 1024)
    expect((await sharp(jpeg).metadata()).exif).toBeDefined()

    const image = await uploadImage(jpeg, folder)

    expect(image).toMatchObject({ contentType: "image/webp", width: 2000, height: 1500, originalSize: jpeg.length })
    expect(image.url).toBe(`${process.env.MEDIA_PUBLIC_URL}/${image.key}`)

    const res = await fetch(image.url)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/webp")
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")

    const body = Buffer.from(await res.arrayBuffer())
    expect(body.length).toBe(image.size)
    expect(body.length).toBeLessThan(jpeg.length / 4)
    // The key is the hash of exactly the bytes served, so the URL can be cached forever.
    expect(image.key).toBe(`${folder}/${createHash("sha256").update(body).digest("hex").slice(0, 32)}.webp`)
    const metadata = await sharp(body).metadata()
    expect(metadata).toMatchObject({ format: "webp", width: 2000, height: 1500 })
    expect(metadata.exif).toBeUndefined()
  })

  it("keeps small images at their size and preserves transparency", async () => {
    const image = await uploadImage(await transparentPng(), folder)

    const body = Buffer.from(await (await fetch(image.url)).arrayBuffer())
    expect(await sharp(body).metadata()).toMatchObject({ format: "webp", width: 300, height: 200, hasAlpha: true })
  })

  it("stores an image uploaded twice only once", async () => {
    const png = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#0ea5e9" } })
      .png()
      .toBuffer()

    const first = await uploadImage(png, folder)
    const second = await uploadImage(png, folder)

    expect(second.key).toBe(first.key)
    expect((await listMedia(`${folder}/`)).filter((object) => object.key === first.key)).toHaveLength(1)
  })

  it("lists uploaded objects with their public URLs and removes them on delete", async () => {
    const image = await uploadImage(
      await sharp({ create: { width: 20, height: 20, channels: 3, background: "#f97316" } }).png().toBuffer(),
      folder,
    )

    expect(await listMedia(`${folder}/`)).toContainEqual(
      expect.objectContaining({ key: image.key, url: mediaUrl(image.key), size: image.size }),
    )

    await deleteMedia(image.key)

    expect((await fetch(image.url)).status).toBe(404)
    expect((await listMedia(`${folder}/`)).map((object) => object.key)).not.toContain(image.key)
  })

  it("stores nothing for a file that only pretends to be an image", async () => {
    const before = await listMedia(`${folder}/`)

    const upload = uploadImage(Buffer.from("<!doctype html><script>alert(1)</script>"), folder)

    await expect(upload).rejects.toBeInstanceOf(BadRequestError)
    expect(await listMedia(`${folder}/`)).toEqual(before)
  })
})
