import type { R2Bucket } from "./cloudflare-bindings";

/**
 * Where a photo's bytes live.
 *
 * Under the Workers runtime that is an R2 bucket. Under plain Node there is no
 * R2, so bytes are written to `.data/uploads` instead. Both paths use the same
 * flat key, which is what lets `/api/photos/$id` serve a photo without knowing
 * or caring which runtime produced it.
 */
export const MAX_PHOTO_BYTES = 2_500_000;

export const MAX_PHOTOS_PER_COMPLAINT = 6;

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type PhotoMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Whether a photo documents the fault or the repair. */
export const PHOTO_KINDS = ["before", "after"] as const;

export type PhotoKind = (typeof PHOTO_KINDS)[number];

const PHOTO_KIND_SET: ReadonlySet<string> = new Set(PHOTO_KINDS);

export function isPhotoKind(value: string): value is PhotoKind {
  return PHOTO_KIND_SET.has(value);
}

const EXTENSION_BY_MIME: Record<PhotoMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** The content type stored on the object, used when serving the photo back. */
export function defaultMimeType(): PhotoMimeType {
  return "image/jpeg";
}

const MIME_TYPE_SET: ReadonlySet<string> = new Set(ALLOWED_MIME_TYPES);

export function isPhotoMimeType(value: string): value is PhotoMimeType {
  return MIME_TYPE_SET.has(value);
}

export function extensionForMimeType(mime: PhotoMimeType): string {
  return EXTENSION_BY_MIME[mime];
}

/**
 * Reads and validates a base64 data URL, returning the decoded bytes.
 *
 * The declared byte cap is enforced after decoding, because base64 expands the
 * payload by 4/3 and a string-length check alone would let a caller smuggle a
 * larger image past the Workers request-size limit.
 */
export function decodeImageDataUrl(dataUrl: string) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);

  if (!match) throw new Error("Invalid image");

  const [, mime, payload] = match;

  if (!isPhotoMimeType(mime)) throw new Error("Only jpg/png/webp");

  const bytes = new Uint8Array(Buffer.from(payload, "base64"));

  if (bytes.length > MAX_PHOTO_BYTES) throw new Error("Image too large (2.5MB max)");

  return { mime, bytes };
}

/** Flattens a namespaced key into a single safe filename. */
export function localFileNameForKey(key: string): string {
  return key.replace(/\//g, "_");
}

/**
 * Stores photo bytes, preferring the R2 binding and falling back to the local
 * filesystem. Returns the key the photo was written under, which is recorded on
 * the row so the read path needs no knowledge of which store was used.
 */
export async function storePhotoBytes(
  bucket: R2Bucket | undefined,
  key: string,
  bytes: Uint8Array,
  mime: PhotoMimeType,
): Promise<void> {
  if (bucket) {
    await bucket.put(key, bytes, { httpMetadata: { contentType: mime } });

    return;
  }

  // Local dev without an R2 binding: persist under .data/uploads
  const fs = await import("node:fs");
  const path = await import("node:path");
  const dir = path.join(process.cwd(), ".data", "uploads");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, localFileNameForKey(key)), bytes);
}
