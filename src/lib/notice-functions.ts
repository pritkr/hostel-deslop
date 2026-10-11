import { createServerFn } from "@tanstack/react-start";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { dbForRequest } from "./request-db";
import { ensureSession, requireHostelAccess } from "./auth-functions";
import { toEpochMsOr } from "./dates";
import { optionalHostelInput, hostelIdSchema } from "./server-inputs";
import { isWardenRole } from "./auth-fields";
import { uid } from "../utils/format";

export const listNotices = createServerFn({ method: "GET" })
  .validator(optionalHostelInput)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();

    if (data.hostelId) requireHostelAccess(user, data.hostelId);
    const db = await dbForRequest();
    const s = await import("../db/schema");

    const all = await db
      .select()
      .from(s.notices)
      .orderBy(desc(s.notices.createdAt))
      .limit(30);

    const scope = data.hostelId ?? user.hostelId ?? null;

    return all
      .filter((n) => !n.hostelId || !scope || n.hostelId === scope)
      .map((n) => ({
        ...n,
        pinned: Boolean(n.pinned),
        createdAt: toEpochMsOr(n.createdAt, Date.now()),
      }));
  });

const createNoticeInput = z
  .object({
    title: z.string().min(1).max(140),
    body: z.string().min(1).max(2000),
    hostelId: hostelIdSchema.optional(),
    pinned: z.boolean().optional(),
  })
  .strict();

export const createNotice = createServerFn({ method: "POST" })
  .validator(createNoticeInput)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();

    if (!isWardenRole(user.role)) throw new Error("Only warden/admin");
    const title = data.title.trim();
    const body = data.body.trim();

    if (title.length < 4) throw new Error("Title too short");

    if (body.length < 4) throw new Error("Body too short");

    if (user.role === "warden" && data.hostelId && data.hostelId !== user.hostelId) {
      throw new Error("Only your hostel");
    }

    const db = await dbForRequest();
    const s = await import("../db/schema");
    await db.insert(s.notices).values({
      id: uid("nt_"),
      hostelId: data.hostelId || user.hostelId || null,
      authorId: user.id,
      title,
      body: body.slice(0, 2000),
      pinned: Boolean(data.pinned),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { ok: true };
  });

export const listHostels = createServerFn({ method: "GET" }).handler(async () => {
  await ensureSession();
  const db = await dbForRequest();
  const s = await import("../db/schema");

  return await db.select().from(s.hostels).orderBy(s.hostels.id);
});
