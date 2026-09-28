import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { expect, test } from "@playwright/test"
import sharp from "sharp"

// Checks how the production build serves images from the media bucket (S3 emulator from docker
// compose). Each worker stores its own image the way uploadImage does and removes it afterwards;
// the upload pipeline itself is covered by tests/integration/storage.test.ts.
if (!process.env.MEDIA_PUBLIC_URL) process.loadEnvFile(".env.local")
const MEDIA_PUBLIC_URL = process.env.MEDIA_PUBLIC_URL!.replace(/\/+$/, "")

const s3 = new S3Client({
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
})
const key = `e2e/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`
const publicUrl = `${MEDIA_PUBLIC_URL}/${key}`

const optimised = (url: string, width = 640) => `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=75`

test.beforeAll(async () => {
  const body = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: "#16a34a" } })
    .webp({ quality: 80 })
    .toBuffer()
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  )
})

test.afterAll(async () => {
  await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }))
})

test.describe("media images", () => {
  test("are resized by the image optimiser and cached for at least 31 days", async ({ request }) => {
    const res = await request.get(optimised(publicUrl, 640), { headers: { accept: "image/webp,image/*" } })

    expect(res.status()).toBe(200)
    expect(res.headers()["content-type"]).toBe("image/webp")
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers()["cache-control"] ?? "")?.[1])
    expect(maxAge).toBeGreaterThanOrEqual(2_678_400)
    expect(await sharp(await res.body()).metadata()).toMatchObject({ format: "webp", width: 640, height: 480 })
  })

  test("display in the browser from their optimised URL", async ({ page }) => {
    await page.goto("/")
    const naturalWidth = await page.evaluate(async (src) => {
      const img = new Image()
      img.src = src
      await img.decode()
      return img.naturalWidth
    }, optimised(publicUrl, 1080))

    expect(naturalWidth).toBe(1080)
  })

  test("are only fetched from the media bucket, not from other paths on the same host", async ({ request }) => {
    const otherBucket = new URL(publicUrl)
    otherBucket.pathname = `/other-bucket/${key}`

    const res = await request.get(optimised(otherBucket.href))

    expect(res.status()).toBe(400)
  })

  test("have their storage reported by the health check", async ({ request }) => {
    const res = await request.get("/api/health")

    expect(res.status()).toBe(200)
    expect(await res.json()).toMatchObject({ status: "ok", db: "up", storage: "up" })
  })
})
