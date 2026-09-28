import "server-only"

import { createHash } from "node:crypto"

import {
  DeleteObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import sharp from "sharp"

import { BadRequestError } from "@/lib/errors"
import { logger } from "@/lib/logger"

const log = logger.child({ scope: "storage" })

// Uploads are normalised before they're stored: EXIF orientation applied, scaled down to fit
// MAX_IMAGE_DIMENSION, re-encoded as WebP and stripped of metadata (EXIF, GPS). A 10 MB phone
// photo ends up as a few hundred KB, and next/image derives its per-screen variants from that.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const MAX_IMAGE_DIMENSION = 2000
const WEBP_QUALITY = 80
// A small file can still decode to billions of pixels; refuse anything above ~50 megapixels.
const MAX_INPUT_PIXELS = 50_000_000

// Keys are content hashes, so a URL always points at the same bytes and CDNs/browsers can keep it forever.
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable"

export type ImageType = "image/jpeg" | "image/png" | "image/webp" | "image/avif"

export type StoredImage = {
  key: string
  url: string
  contentType: "image/webp"
  width: number
  height: number
  size: number
  originalSize: number
}

export type MediaObject = {
  key: string
  url: string
  size: number
  lastModified?: Date
}

type StorageConfig = {
  bucket: string
  publicUrl: string
}

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env.local and run \`docker compose up -d\`.`)
  }
  return value
}

function getConfig(): StorageConfig {
  return {
    bucket: requireEnv("S3_BUCKET"),
    publicUrl: requireEnv("MEDIA_PUBLIC_URL").replace(/\/+$/, ""),
  }
}

// Reuse one client across hot reloads in dev, like the Postgres pool in src/lib/db.ts.
const globalForStorage = globalThis as unknown as { s3Client?: S3Client }

function createClient() {
  // Without S3_ENDPOINT the SDK talks to AWS S3; with it, to any S3-compatible service (S3Mock, R2, …).
  const endpoint = process.env.S3_ENDPOINT || undefined
  const client = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    },
  })
  log.info("S3 client created", { endpoint: endpoint ?? "aws" })
  return client
}

export function getS3Client() {
  globalForStorage.s3Client ??= createClient()
  return globalForStorage.s3Client
}

// Trust the bytes, not the browser-supplied MIME type. This also narrows uploads to photo formats:
// sharp would happily decode SVG, TIFF, GIF and more.
export function detectImageType(bytes: Uint8Array): ImageType | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (bytes.length >= 8 && ascii(0, 8) === "\x89PNG\r\n\x1a\n") return "image/png"
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp"
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return "image/avif"
  return null
}

const FOLDER_PATTERN = /^[a-z0-9-]+(\/[a-z0-9-]+)*$/

// Public URL of an object: the CDN (or, locally, the S3 emulator) that fronts the bucket.
export function mediaUrl(key: string) {
  const path = key.split("/").map(encodeURIComponent).join("/")
  return `${getConfig().publicUrl}/${path}`
}

// Animated images keep only their first frame.
async function optimiseImage(body: Uint8Array) {
  try {
    const { data, info } = await sharp(body, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true })
    return { data, width: info.width, height: info.height }
  } catch (err) {
    log.warn("Image could not be processed", { message: (err as Error).message })
    throw new BadRequestError("The image couldn't be read. It may be damaged or too large.")
  }
}

export async function uploadImage(body: Uint8Array, folder: string): Promise<StoredImage> {
  if (!FOLDER_PATTERN.test(folder)) throw new Error(`Invalid media folder: "${folder}"`)
  if (body.length === 0) throw new BadRequestError("The image is empty.")
  if (body.length > MAX_UPLOAD_BYTES) {
    throw new BadRequestError(`Images can be at most ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`)
  }
  if (!detectImageType(body)) throw new BadRequestError("Only JPEG, PNG, WebP and AVIF images are supported.")

  const { data, width, height } = await optimiseImage(body)
  // Hash what's stored, so the key changes whenever the served bytes do.
  const hash = createHash("sha256").update(data).digest("hex").slice(0, 32)
  const key = `${folder}/${hash}.webp`

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getConfig().bucket,
      Key: key,
      Body: data,
      ContentType: "image/webp",
      CacheControl: IMMUTABLE_CACHE_CONTROL,
    }),
  )
  log.info("Image uploaded", { key, width, height, size: data.length, originalSize: body.length })

  return {
    key,
    url: mediaUrl(key),
    contentType: "image/webp",
    width,
    height,
    size: data.length,
    originalSize: body.length,
  }
}

export async function deleteMedia(key: string) {
  await getS3Client().send(new DeleteObjectCommand({ Bucket: getConfig().bucket, Key: key }))
  log.info("Media deleted", { key })
}

// Newest first. Lists a single page (up to 1000 objects), which is plenty for previewing a folder.
export async function listMedia(prefix = ""): Promise<MediaObject[]> {
  const { Contents = [] } = await getS3Client().send(
    new ListObjectsV2Command({ Bucket: getConfig().bucket, Prefix: prefix }),
  )
  return Contents.filter((object) => object.Key)
    .map((object) => ({
      key: object.Key!,
      url: mediaUrl(object.Key!),
      size: object.Size ?? 0,
      lastModified: object.LastModified,
    }))
    .sort((a, b) => (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0))
}

// Throws when the bucket is missing or the storage service is unreachable.
export async function checkStorage() {
  await getS3Client().send(new HeadBucketCommand({ Bucket: getConfig().bucket }))
}
