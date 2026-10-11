import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { dbForRequest } from "./request-db";
import { ensureSession, requireHostelAccess } from "./auth-functions";
import { canSeeConfidential, canTransition, isStaffish } from "./complaint-policy";
import { idInput, idSchema } from "./server-inputs";
import { uid } from "../utils/format";

const transitionInput = z
  .object({
    id: idSchema,
    to: z.string().min(1).max(32),
    remark: z.string().max(500).optional(),
    assigneeId: z.string().max(64).optional(),
  })
  .strict();

export const transitionComplaint = createServerFn({ method: "POST" })
  .validator(transitionInput)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();
    const db = await dbForRequest();
    const s = await import("../db/schema");
    const rows = await db.select().from(s.complaints).where(eq(s.complaints.id, data.id)).limit(1);
    const c = rows[0];

    if (!c) throw new Error("Not found");

    if (!canTransition(c.status, data.to)) {
      throw new Error(`Cannot move ${c.status} to ${data.to}`);
    }

    const staffish = isStaffish(user.role);

    if (["acknowledged", "in_progress", "resolved"].includes(data.to) && !staffish) {
      throw new Error("Only staff/warden can do this step");
    }

    if (data.to === "rejected" && !["warden", "admin"].includes(user.role)) {
      throw new Error("Only warden can reject");
    }

    if (data.to === "closed" && !(c.studentId === user.id || user.role === "admin")) {
      throw new Error("Only the student can verify & close");
    }

    // Reopening is a claim that the work is still not done, so it belongs to
    // the person who reported it or to staff — never to an unrelated resident
    // who merely has a session. Without this, any signed-in user could reopen
    // any closed repair in the system.
    if (data.to === "reopened" && !(c.studentId === user.id || staffish)) {
      throw new Error("Only the reporter or staff can reopen");
    }

    // The update set is typed against the table's insert shape, so a typo in a
    // column name is a compile error rather than a silently dropped write.
    type ComplaintPatch = Partial<typeof s.complaints.$inferInsert>;

    const patch: ComplaintPatch = {
      status: data.to,
      overdue: false,
      updatedAt: new Date(),
    };

    if (data.assigneeId !== undefined) patch.assigneeId = data.assigneeId || null;

    if (data.to === "resolved") patch.resolvedAt = new Date();

    if (data.to === "closed") patch.closedAt = new Date();

    // Reopening retracts the completion claim, so the resolution timestamps are
    // cleared rather than left to contradict the reopened status.
    if (data.to === "reopened") {
      patch.resolvedAt = null;
      patch.closedAt = null;
    }

    await db.update(s.complaints).set(patch).where(eq(s.complaints.id, c.id));
    await db.insert(s.activities).values({
      id: uid("act_"),
      complaintId: c.id,
      actorId: user.id,
      actorRole: user.role,
      fromStatus: c.status,
      toStatus: data.to,
      remark: data.remark?.slice(0, 500) || null,
      createdAt: new Date(),
    });

    return { ok: true };
  });

const commentInput = z
  .object({
    id: idSchema,
    body: z.string().min(1).max(1000),
    visibility: z.enum(["public", "staff"]).optional(),
    kind: z.enum(["message", "signal"]).optional(),
  })
  .strict();

export const addComment = createServerFn({ method: "POST" })
  .validator(commentInput)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();
    const body = data.body.trim();

    if (body.length < 2) throw new Error("Add a little more detail");

    if (body.length > 1000) throw new Error("Keep it under 1000 characters");
    const db = await dbForRequest();
    const s = await import("../db/schema");

    // Load the complaint first: posting is a write to a thread, so it must obey
    // the same visibility rule as reading it. Without this check a resident who
    // is refused the confidential report could still write into its thread.
    const rows = await db
      .select()
      .from(s.complaints)
      .where(eq(s.complaints.id, data.id))
      .limit(1);

    const c = rows[0];

    if (!c) throw new Error("Not found");
    requireHostelAccess(user, c.hostelId);

    if (!canSeeConfidential(user, c)) throw new Error("Forbidden");

    const visibility = data.visibility === "staff" ? "staff" : "public";
    const kind = data.kind === "signal" ? "signal" : "message";
    await db.insert(s.comments).values({
      id: uid("cmt_"),
      complaintId: data.id,
      authorId: user.id,
      body,
      visibility,
      kind,
      createdAt: new Date(),
    });

    // Signals are accountability events too — they belong on the append-only timeline.
    if (kind === "signal") {
      await db.insert(s.activities).values({
        id: uid("act_"),
        complaintId: data.id,
        actorId: user.id,
        actorRole: user.role,
        fromStatus: null,
        toStatus: null,
        remark: `${visibility === "staff" ? "Private signal" : "Resident signal"} from ${user.name}: ${body.slice(0, 200)}`,
        createdAt: new Date(),
      });
    }

    return { ok: true };
  });

export const toggleUpvote = createServerFn({ method: "POST" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();
    const db = await dbForRequest();
    const s = await import("../db/schema");
    // Upvoting is a write to someone else's repair, so it has to clear the same
    // bar as reading it. Without this check any signed-in resident could inflate
    // the count on a confidential report they are not allowed to open, which both
    // leaks that the report exists and corrupts the signal staff triage by.
    const cur = await db.select().from(s.complaints).where(eq(s.complaints.id, data.id)).limit(1);

    if (!cur[0]) throw new Error("Not found");

    requireHostelAccess(user, cur[0].hostelId);

    if (!canSeeConfidential(user, cur[0])) throw new Error("Forbidden");

    const existing = await db
      .select()
      .from(s.upvotes)
      .where(and(eq(s.upvotes.complaintId, data.id), eq(s.upvotes.userId, user.id)))
      .limit(1);

    if (existing[0]) {
      await db
        .delete(s.upvotes)
        .where(and(eq(s.upvotes.complaintId, data.id), eq(s.upvotes.userId, user.id)));
      await db
        .update(s.complaints)
        .set({ upvotes: Math.max(0, (cur[0].upvotes ?? 1) - 1) })
        .where(eq(s.complaints.id, data.id));

      return { upvoted: false };
    }

    await db.insert(s.upvotes).values({
      id: uid("up_"),
      complaintId: data.id,
      userId: user.id,
      createdAt: new Date(),
    });
    await db
      .update(s.complaints)
      .set({ upvotes: (cur[0].upvotes ?? 0) + 1 })
      .where(eq(s.complaints.id, data.id));

    return { upvoted: true };
  });
