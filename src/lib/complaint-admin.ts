import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { dbForRequest } from "./request-db";
import { ensureSession } from "./auth-functions";
import { isStaffRole, isWardenRole } from "./auth-fields";
import { idSchema } from "./server-inputs";
import { uid } from "../utils/format";

const assignInput = z.object({ id: idSchema, assigneeId: idSchema }).strict();

export const assignComplaint = createServerFn({ method: "POST" })
  .validator(assignInput)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();

    if (!isWardenRole(user.role)) throw new Error("Only warden/admin");
    const db = await dbForRequest();
    const s = await import("../db/schema");
    const target = await db.select().from(s.user).where(eq(s.user.id, data.assigneeId)).limit(1);

    if (!target[0] || !isStaffRole(target[0].role)) {
      throw new Error("Assignee must be staff/warden");
    }

    await db
      .update(s.complaints)
      .set({ assigneeId: data.assigneeId, updatedAt: new Date() })
      .where(eq(s.complaints.id, data.id));
    await db.insert(s.activities).values({
      id: uid("act_"),
      complaintId: data.id,
      actorId: user.id,
      actorRole: user.role,
      fromStatus: null,
      toStatus: null,
      remark: `Assigned to ${target[0].name}`,
      createdAt: new Date(),
    });

    return { ok: true };
  });

const rateInput = z
  .object({
    id: idSchema,
    rating: z.number().int().min(1).max(5),
    note: z.string().max(300).optional(),
  })
  .strict();

export const rateComplaint = createServerFn({ method: "POST" })
  .validator(rateInput)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();
    const db = await dbForRequest();
    const s = await import("../db/schema");
    const cur = await db.select().from(s.complaints).where(eq(s.complaints.id, data.id)).limit(1);

    if (!cur[0]) throw new Error("Not found");

    if (cur[0].studentId !== user.id && user.role !== "admin") {
      throw new Error("Only owner can rate");
    }

    // A rating is a verdict on finished work, so it may only follow a repair
    // that was actually resolved. Writing `closed` straight onto the row let a
    // reporter jump submitted -> closed and skip the whole flow.
    if (!["resolved", "closed"].includes(cur[0].status)) {
      throw new Error(`Cannot rate a ${cur[0].status} repair — it is not finished yet`);
    }

    await db
      .update(s.complaints)
      .set({
        rating: data.rating,
        ratingNote: data.note?.slice(0, 300) ?? null,
        status: "closed",
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(s.complaints.id, data.id));
    await db.insert(s.activities).values({
      id: uid("act_"),
      complaintId: data.id,
      actorId: user.id,
      actorRole: user.role,
      fromStatus: cur[0].status,
      toStatus: "closed",
      remark: `Rated ${data.rating}/5`,
      createdAt: new Date(),
    });

    return { ok: true };
  });
