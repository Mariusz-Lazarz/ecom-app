// What `uploadImage` (src/lib/storage.ts) accepts. Client-safe, so upload forms can check files
// before sending them; the server still checks the bytes themselves.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export const UPLOAD_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const
export type ImageType = (typeof UPLOAD_IMAGE_TYPES)[number]
