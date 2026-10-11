import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { dbForRequest } from "./request-db";
import { ensureSession, requireHostelAccess } from "./auth-functions";
import { canSeeConfidential, isStaffish } from "./complaint-policy";
import {
  MAX_PHOTOS_PER_COMPLAINT,
  PHOTO_KINDS,
  decodeImageDataUrl,
  extensionForMimeType,
  storePhotoBytes,
} from "./photo-storage";
import { idSchema } from "./server-inputs";
import { uid } from "../utils/format";

const listPhotosInput = z.object({ complaintId: idSchema }).strict();

export const listPhotos = createServerFn({ method: "GET" })
  .validator(listPhotosInput)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();
    const db = await dbForRequest();
    const s = await import("../db/schema");

    // Photo metadata (r2 key, size, mime, timestamps) is only as safe as the
    // complaint it hangs off. The bytes are already gated by /api/photos/$id, but
    // this listing previously called nothing but ensureSession(), so any session
    // could enumerate the photos attached to any complaint id, including a
    // confidential one. It now applies the same visibility rule as getComplaint.
    const owners = await db
      .select({
        studentId: s.complaints.studentId,
        assigneeId: s.complaints.assigneeId,
        hostelId: s.complaints.hostelId,
        confidential: s.complaints.confidential,
      })
      .from(s.complaints)
      .where(eq(s.complaints.id, data.complaintId))
      .limit(1);

    const complaint = owners[0];

    if (!complaint) throw new Error("Not found");
    requireHostelAccess(user, complaint.hostelId);

    if (!canSeeConfidential(user, complaint)) throw new Error("Forbidden");

    return db
      .select()
      .from(s.complaintPhotos)
      .where(eq(s.complaintPhotos.complaintId, data.complaintId))
      .orderBy(desc(s.complaintPhotos.createdAt));
  });

// R2 upload goes through this JSON+base64 serverFn (Workers-safe, ≤2MB).
// Client compresses to webp/jpeg <500KB before sending.
const uploadPhotoInput = z
  .object({
    complaintId: idSchema,
    // The cap is on the encoded string; the decoded byte cap is enforced in
    // decodeImageDataUrl, where the real payload size is known.
    dataUrl: z.string().min(1).max(3_500_000),
    kind: z.enum(PHOTO_KINDS).optional(),
  })
  .strict();

export const uploadPhoto = createServerFn({ method: "POST" })
  .validator(uploadPhotoInput)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();
    const db = await dbForRequest();
    const s = await import("../db/schema");

    const rows = await db
      .select()
      .from(s.complaints)
      .where(eq(s.complaints.id, data.complaintId))
      .limit(1);

    const c = rows[0];

    if (!c) throw new Error("Not found");

    const can =
      c.studentId === user.id || isStaffish(user.role);

    if (!can) throw new Error("Forbidden");

    const existing = await db
      .select({ id: s.complaintPhotos.id })
      .from(s.complaintPhotos)
      .where(eq(s.complaintPhotos.complaintId, data.complaintId));

    if (existing.length >= MAX_PHOTOS_PER_COMPLAINT) {
      throw new Error("Max 6 photos per complaint");
    }

    const { mime, bytes } = decodeImageDataUrl(data.dataUrl);
    const { getServerEnv } = await import("./server-env");
    const env = await getServerEnv();
    const key = `${data.complaintId}/${uid("img_")}.${extensionForMimeType(mime)}`;

    await storePhotoBytes(env.PHOTOS, key, bytes, mime);

    const id = uid("ph_");
    await db.insert(s.complaintPhotos).values({
      id,
      complaintId: data.complaintId,
      r2Key: key,
      kind: data.kind === "after" ? "after" : "before",
      mimeType: mime,
      sizeBytes: bytes.length,
      createdAt: new Date(),
    });

    return { id, url: `/api/photos/${id}` };
  });
