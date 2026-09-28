// @vitest-environment node
import { createHash } from "node:crypto"

import sharp from "sharp"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// Keep the real command classes (their .input is what we assert on) but never open a connection.
const send = vi.fn()
const clientConfigs: unknown[] = []
vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>()
  class S3Client {
    constructor(config: unknown) {
      clientConfigs.push(config)
    }
    send = send
  }
  return { ...actual, S3Client }
})

const { DeleteObjectCommand, HeadBucketCommand, ListObjectsV2Command, PutObjectCommand } = await import(
  "@aws-sdk/client-s3"
)
const storage = await import("@/lib/storage")
const { BadRequestError } = await import("@/lib/errors")

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16])
const bytes = (text: string) => new TextEncoder().encode(text)
const WEBP = bytes("RIFF\0\0\0\0WEBPVP8 ")
const AVIF = Uint8Array.from([0, 0, 0, 0x1c, ...bytes("ftypavif")])

const sha = (body: Uint8Array) => createHash("sha256").update(body).digest("hex").slice(0, 32)

beforeEach(() => {
  vi.stubEnv("S3_ENDPOINT", "http://localhost:9090")
  vi.stubEnv("S3_REGION", "eu-central-1")
  vi.stubEnv("S3_BUCKET", "test-media")
  vi.stubEnv("S3_ACCESS_KEY_ID", "key")
  vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret")
  vi.stubEnv("S3_FORCE_PATH_STYLE", "true")
  vi.stubEnv("MEDIA_PUBLIC_URL", "https://cdn.example.com/media/")
  send.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("detectImageType", () => {
  it.each([
    ["image/jpeg", JPEG],
    ["image/png", PNG],
    ["image/webp", WEBP],
    ["image/avif", AVIF],
  ])("recognises %s from its magic bytes", (type, body) => {
    expect(storage.detectImageType(body)).toBe(type)
  })

  it.each([
    ["empty input", new Uint8Array()],
    ["HTML", bytes("<!doctype html><script>alert(1)</script>")],
    ["SVG", bytes('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ["a truncated PNG signature", PNG.subarray(0, 7)],
    ["a RIFF file that isn't WebP", bytes("RIFF\0\0\0\0WAVEfmt ")],
  ])("rejects %s", (_, body) => {
    expect(storage.detectImageType(body)).toBeNull()
  })
})

describe("mediaUrl", () => {
  it("joins the key onto the public base URL without doubling the slash", () => {
    expect(storage.mediaUrl("products/abc.png")).toBe("https://cdn.example.com/media/products/abc.png")
  })

  it("encodes each path segment but keeps the separators", () => {
    expect(storage.mediaUrl("uploads/a b#1.png")).toBe("https://cdn.example.com/media/uploads/a%20b%231.png")
  })

  it("explains what to do when MEDIA_PUBLIC_URL is missing", () => {
    vi.stubEnv("MEDIA_PUBLIC_URL", "")
    expect(() => storage.mediaUrl("a.png")).toThrow(/MEDIA_PUBLIC_URL is not set/)
  })
})

describe("uploadImage", () => {
  const solid = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } })
  // A gradient with grain, so the encoder has real detail to work with like in a photo.
  const photo = (width: number, height: number) => {
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
  }
  const storedBody = () => send.mock.calls[0][0].input.Body as Buffer

  beforeEach(() => {
    send.mockResolvedValue({})
  })

  it("stores a WebP under a hash of the stored bytes with immutable caching", async () => {
    const png = await solid(64, 48).png().toBuffer()

    const image = await storage.uploadImage(png, "products")

    const body = storedBody()
    const key = `products/${sha(body)}.webp`
    expect(image).toEqual({
      key,
      url: `https://cdn.example.com/media/${key}`,
      contentType: "image/webp",
      width: 64,
      height: 48,
      size: body.length,
      originalSize: png.length,
    })
    expect(send).toHaveBeenCalledTimes(1)
    const command = send.mock.calls[0][0]
    expect(command).toBeInstanceOf(PutObjectCommand)
    expect(command.input).toEqual({
      Bucket: "test-media",
      Key: key,
      Body: body,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    })
    expect(await sharp(body).metadata()).toMatchObject({ format: "webp", width: 64, height: 48 })
  })

  it("configures the client from the environment", async () => {
    await storage.uploadImage(await solid(8, 8).png().toBuffer(), "products")

    // One client is created and reused for the whole process.
    expect(clientConfigs).toEqual([
      {
        region: "eu-central-1",
        endpoint: "http://localhost:9090",
        forcePathStyle: true,
        credentials: { accessKeyId: "key", secretAccessKey: "secret" },
      },
    ])
  })

  it("shrinks a large photo to fit 2000 px, keeping its aspect ratio, and makes it much smaller", async () => {
    const jpeg = await photo(4000, 3000).jpeg({ quality: 92 }).toBuffer()

    const image = await storage.uploadImage(jpeg, "uploads")

    expect(image).toMatchObject({ width: 2000, height: 1500, originalSize: jpeg.length })
    expect(image.size).toBeLessThan(jpeg.length / 4)
    expect(await sharp(storedBody()).metadata()).toMatchObject({ format: "webp", width: 2000, height: 1500 })
  })

  it("fits portrait images by their height", async () => {
    const image = await storage.uploadImage(await solid(1000, 4000).png().toBuffer(), "uploads")
    expect(image).toMatchObject({ width: 500, height: 2000 })
  })

  it("leaves an image of exactly 2000 px alone, shrinks one just over it and never enlarges small ones", async () => {
    expect(await storage.uploadImage(await solid(2000, 1000).png().toBuffer(), "uploads")).toMatchObject({
      width: 2000,
      height: 1000,
    })
    expect(await storage.uploadImage(await solid(2002, 1000).png().toBuffer(), "uploads")).toMatchObject({
      width: 2000,
      height: 999,
    })
    expect(await storage.uploadImage(await solid(10, 20).png().toBuffer(), "uploads")).toMatchObject({
      width: 10,
      height: 20,
    })
  })

  it("applies the EXIF orientation and strips all metadata, including GPS", async () => {
    // Stored sideways, as phone cameras do; EXIF orientation 6 means "rotate 90° clockwise to display".
    const jpeg = await solid(300, 100)
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExif({ IFD0: { Make: "Phone" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "52/1 13/1 0/1" } })
      .toBuffer()
    expect((await sharp(jpeg).metadata()).exif).toBeDefined()

    const image = await storage.uploadImage(jpeg, "uploads")

    expect(image).toMatchObject({ width: 100, height: 300 })
    const stored = await sharp(storedBody()).metadata()
    expect(stored).toMatchObject({ width: 100, height: 300 })
    expect(stored.exif).toBeUndefined()
    expect(stored.orientation).toBeUndefined()
  })

  it("keeps transparency", async () => {
    const png = await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer()

    await storage.uploadImage(png, "uploads")

    expect(await sharp(storedBody()).metadata()).toMatchObject({ format: "webp", hasAlpha: true })
  })

  it.each([
    ["JPEG", () => solid(40, 30).jpeg().toBuffer()],
    ["WebP", () => solid(40, 30).webp().toBuffer()],
    ["AVIF", () => solid(40, 30).avif().toBuffer()],
  ])("accepts %s and stores it as WebP", async (_, make) => {
    const image = await storage.uploadImage(await make(), "uploads")
    expect(image).toMatchObject({ key: expect.stringMatching(/^uploads\/[0-9a-f]{32}\.webp$/), width: 40, height: 30 })
  })

  it("gives the same image the same key and a different image a different one", async () => {
    const png = await solid(32, 32).png().toBuffer()
    const first = await storage.uploadImage(png, "uploads")
    const again = await storage.uploadImage(Uint8Array.from(png), "uploads")
    const other = await storage.uploadImage(await solid(32, 33).png().toBuffer(), "uploads")

    expect(again.key).toBe(first.key)
    expect(other.key).not.toBe(first.key)
  })

  it("accepts nested folders", async () => {
    const image = await storage.uploadImage(await solid(8, 8).png().toBuffer(), "products/2026-09")
    expect(image.key).toMatch(/^products\/2026-09\/[0-9a-f]{32}\.webp$/)
  })

  it("accepts an upload of exactly 10 MB", async () => {
    const jpeg = await solid(64, 64).jpeg().toBuffer()
    // Bytes after the JPEG end marker are ignored by decoders.
    const body = new Uint8Array(storage.MAX_UPLOAD_BYTES)
    body.set(jpeg)

    await expect(storage.uploadImage(body, "uploads")).resolves.toMatchObject({
      width: 64,
      originalSize: storage.MAX_UPLOAD_BYTES,
    })
  })

  it("rejects an upload one byte over 10 MB without processing it", async () => {
    const body = new Uint8Array(storage.MAX_UPLOAD_BYTES + 1)
    body.set(PNG)

    const upload = storage.uploadImage(body, "uploads")
    await expect(upload).rejects.toThrow(BadRequestError)
    await expect(upload).rejects.toThrow("Images can be at most 10 MB.")
    expect(send).not.toHaveBeenCalled()
  })

  it("refuses images over 50 megapixels even when the file is small", async () => {
    const png = await solid(10_000, 5_001).png().toBuffer()
    expect(png.length).toBeLessThan(storage.MAX_UPLOAD_BYTES)

    const upload = storage.uploadImage(png, "uploads")
    await expect(upload).rejects.toBeInstanceOf(BadRequestError)
    await expect(upload).rejects.toThrow("The image couldn't be read. It may be damaged or too large.")
    expect(send).not.toHaveBeenCalled()
  })

  it("rejects a file with an image signature but broken data", async () => {
    const upload = storage.uploadImage(PNG, "uploads")
    await expect(upload).rejects.toBeInstanceOf(BadRequestError)
    await expect(upload).rejects.toThrow("The image couldn't be read. It may be damaged or too large.")
    expect(send).not.toHaveBeenCalled()
  })

  it("rejects an empty body", async () => {
    await expect(storage.uploadImage(new Uint8Array(), "uploads")).rejects.toThrow("The image is empty.")
    expect(send).not.toHaveBeenCalled()
  })

  it.each([
    ["HTML", async () => bytes("<html>hi</html>")],
    ["SVG", async () => bytes('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')],
    ["GIF", () => solid(10, 10).gif().toBuffer()],
    ["TIFF", () => solid(10, 10).tiff().toBuffer()],
  ])("rejects %s", async (_, make) => {
    const upload = storage.uploadImage(await make(), "uploads")
    await expect(upload).rejects.toBeInstanceOf(BadRequestError)
    await expect(upload).rejects.toThrow("Only JPEG, PNG, WebP and AVIF images are supported.")
    expect(send).not.toHaveBeenCalled()
  })

  it.each(["", "/products", "products/", "../etc", "Products", "a//b", "a b"])(
    "refuses the folder %j",
    async (folder) => {
      await expect(storage.uploadImage(PNG, folder)).rejects.toThrow(`Invalid media folder: "${folder}"`)
      expect(send).not.toHaveBeenCalled()
    },
  )

  it("passes storage failures through to the caller", async () => {
    send.mockRejectedValue(new Error("connect ECONNREFUSED"))
    await expect(storage.uploadImage(await solid(8, 8).png().toBuffer(), "uploads")).rejects.toThrow(
      "connect ECONNREFUSED",
    )
  })
})

describe("deleteMedia", () => {
  it("deletes the object from the bucket", async () => {
    send.mockResolvedValue({})
    await storage.deleteMedia("uploads/abc.png")

    const command = send.mock.calls[0][0]
    expect(command).toBeInstanceOf(DeleteObjectCommand)
    expect(command.input).toEqual({ Bucket: "test-media", Key: "uploads/abc.png" })
  })
})

describe("listMedia", () => {
  it("returns objects newest first with their public URLs", async () => {
    send.mockResolvedValue({
      Contents: [
        { Key: "uploads/old.png", Size: 10, LastModified: new Date("2026-01-01") },
        { Key: "uploads/new.png", Size: 20, LastModified: new Date("2026-02-01") },
      ],
    })

    expect(await storage.listMedia("uploads/")).toEqual([
      {
        key: "uploads/new.png",
        url: "https://cdn.example.com/media/uploads/new.png",
        size: 20,
        lastModified: new Date("2026-02-01"),
      },
      {
        key: "uploads/old.png",
        url: "https://cdn.example.com/media/uploads/old.png",
        size: 10,
        lastModified: new Date("2026-01-01"),
      },
    ])
    const command = send.mock.calls[0][0]
    expect(command).toBeInstanceOf(ListObjectsV2Command)
    expect(command.input).toEqual({ Bucket: "test-media", Prefix: "uploads/" })
  })

  it("returns an empty list for an empty bucket", async () => {
    send.mockResolvedValue({})
    expect(await storage.listMedia()).toEqual([])
  })
})

describe("checkStorage", () => {
  it("checks that the bucket exists", async () => {
    send.mockResolvedValue({})
    await storage.checkStorage()

    const command = send.mock.calls[0][0]
    expect(command).toBeInstanceOf(HeadBucketCommand)
    expect(command.input).toEqual({ Bucket: "test-media" })
  })

  it("rejects when the bucket is missing or unreachable", async () => {
    send.mockRejectedValue(Object.assign(new Error("NotFound"), { name: "NotFound" }))
    await expect(storage.checkStorage()).rejects.toThrow("NotFound")
  })
})
