import { eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { dbForRequest } from "./request-db";
import { ensureSession } from "./auth-functions";
import { isStaffRole } from "./auth-fields";
import { idInput, idSchema, reasonSchema } from "./server-inputs";
import { uid } from "../utils/format";

const staffOnly = (role: string) => {
  if (!isStaffRole(role)) throw new Error("Only staff");
};

export const claimComplaint = createServerFn({ method: "POST" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();

    staffOnly(user.role);
    const db = await dbForRequest();
    const s = await import("../db/schema");
    const rows = await db.select().from(s.complaints).where(eq(s.complaints.id, data.id)).limit(1);
    const c = rows[0];

    if (!c) throw new Error("Not found");

    if (c.assigneeId && c.assigneeId !== user.id && user.role === "staff") throw new Error("Already owned");
    const to = c.status === "submitted" ? "acknowledged" : c.status;
    await db.update(s.complaints).set({ assigneeId: user.id, status: to, updatedAt: new Date() }).where(eq(s.complaints.id, c.id));
    await db.insert(s.activities).values({ id: uid("act_"), complaintId: c.id, actorId: user.id, actorRole: user.role, fromStatus: c.status, toStatus: to, remark: `Accepted by ${user.name}`, createdAt: new Date() });

    return { ok: true };
  });

const handoffInput = z
  .object({
    id: idSchema,
    toUserId: idSchema.optional(),
    reason: reasonSchema,
  })
  .strict();

export const handoffComplaint = createServerFn({ method: "POST" })
  .validator(handoffInput)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();

    staffOnly(user.role);
    const db = await dbForRequest();
    const s = await import("../db/schema");
    const rows = await db.select().from(s.complaints).where(eq(s.complaints.id, data.id)).limit(1);
    const c = rows[0];

    if (!c) throw new Error("Not found");
    let next: string | null = null;
    let remark = `Released to queue by ${user.name}`;

    if (data.toUserId) {
      const t = await db.select().from(s.user).where(eq(s.user.id, data.toUserId)).limit(1);

      if (!t[0]) throw new Error("Bad target");

      // A repair can only be held by someone who can act on it. Without the role
      // check any job could be assigned to a resident, who then appears as the
      // owner and can never advance it. assignComplaint already enforces this.
      if (!isStaffRole(t[0].role)) {
        throw new Error("Hand off to a staff member, warden or admin");
      }

      next = t[0].id;
      remark = `Handoff ${user.name} -> ${t[0].name}${data.reason ? " : " + data.reason : ""}`;
    } else if (data.reason) remark = `Released by ${user.name} : ${data.reason}`;
    await db.update(s.complaints).set({ assigneeId: next, updatedAt: new Date() }).where(eq(s.complaints.id, c.id));
    await db.insert(s.activities).values({ id: uid("act_"), complaintId: c.id, actorId: user.id, actorRole: user.role, fromStatus: c.status, toStatus: c.status, remark: remark.slice(0, 500), createdAt: new Date() });

    return { ok: true };
  });

const markBlockedInput = z
  .object({
    id: idSchema,
    reason: z.string().min(1).max(200),
    // A short free-text "until" label rather than a date: the board renders it
    // verbatim, and a parsed date would imply a precision nobody maintains.
    until: z.string().min(1).max(32),
  })
  .strict();

export const markBlocked = createServerFn({ method: "POST" })
  .validator(markBlockedInput)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();

    staffOnly(user.role);
    const reason = data.reason.trim().slice(0, 200);

    if (reason.length < 3) throw new Error("Give a short reason");
    const db = await dbForRequest();
    const s = await import("../db/schema");
    const rows = await db.select().from(s.complaints).where(eq(s.complaints.id, data.id)).limit(1);
    const c = rows[0];

    if (!c) throw new Error("Not found");
    await db.update(s.complaints).set({ updatedAt: new Date() }).where(eq(s.complaints.id, c.id));
    await db.insert(s.activities).values({
      id: uid("act_"),
      complaintId: c.id,
      actorId: user.id,
      actorRole: user.role,
      fromStatus: c.status,
      toStatus: c.status,
      remark: `Blocked until ${data.until} : ${reason}`,
      createdAt: new Date(),
    });

    return { ok: true };
  });

const escalateInput = z.object({ id: idSchema, reason: reasonSchema }).strict();

export const escalateComplaint = createServerFn({ method: "POST" })
  .validator(escalateInput)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();

    staffOnly(user.role);
    const db = await dbForRequest();
    const s = await import("../db/schema");
    // Check the target exists, so a stale id returns a clean "Not found" instead
    // of leaking the driver's insert error to the user.
    const rows = await db.select().from(s.complaints).where(eq(s.complaints.id, data.id)).limit(1);

    if (!rows[0]) throw new Error("Not found");
    await db.insert(s.activities).values({ id: uid("act_"), complaintId: data.id, actorId: user.id, actorRole: user.role, fromStatus: null, toStatus: null, remark: `Escalated by ${user.name}${data.reason ? " : " + data.reason : ""}`, createdAt: new Date() });

    return { ok: true };
  });
