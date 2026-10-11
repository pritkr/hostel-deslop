import { createServerFn } from "@tanstack/react-start";
import { desc, eq, inArray } from "drizzle-orm";

import { dbForRequest } from "./request-db";
import { ensureSession, requireHostelAccess } from "./auth-functions";
import { allowedTransitions, canSeeConfidential, canSeePhotos, isStaffish } from "./complaint-policy";
import { idInput } from "./server-inputs";
import { toEpochMs, toEpochMsOr } from "./dates";

export const getComplaint = createServerFn({ method: "GET" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();
    const db = await dbForRequest();
    const s = await import("../db/schema");

    const rows = await db
      .select()
      .from(s.complaints)
      .where(eq(s.complaints.id, data.id))
      .limit(1);

    const c = rows[0];

    if (!c) throw new Error("Not found");
    // A complaint belongs to one building. Reading it must respect that boundary
    // for every role, not just the confidential branch below: a non-confidential
    // report from another hostel is still another resident's private business.
    requireHostelAccess(user, c.hostelId);

    if (!canSeeConfidential(user, c)) throw new Error("Forbidden");

    const [timeline, cmts, photos] = await Promise.all([
      db.select().from(s.activities).where(eq(s.activities.complaintId, c.id)).orderBy(desc(s.activities.createdAt)),
      db.select().from(s.comments).where(eq(s.comments.complaintId, c.id)).orderBy(desc(s.comments.createdAt)).limit(50),
      db.select().from(s.complaintPhotos).where(eq(s.complaintPhotos.complaintId, c.id)),
    ]);

    const staffish = isStaffish(user.role);
    // Private-to-staff messages never reach a resident viewer.
    const visibleComments = staffish ? cmts : cmts.filter((m) => m.visibility !== "staff");
    // Issue photos are for the reporter and authorised staff — never other residents.
    const showPhotos = canSeePhotos(user, c);
    const ids = new Set<string>([c.studentId]);

    if (c.assigneeId) ids.add(c.assigneeId);
    timeline.forEach((t) => t.actorId && ids.add(t.actorId));
    visibleComments.forEach((m) => ids.add(m.authorId));

    const people =
      ids.size > 0 ? await db.select().from(s.user).where(inArray(s.user.id, [...ids])) : [];

    const personById = new Map(people.map((p) => [p.id, p.name]));

    const nameOf = (id: string | null | undefined) =>
      id ? (personById.get(id) ?? id.slice(0, 8)) : null;

    return {
      complaint: {
        ...c,
        overdue: Boolean(c.overdue),
        confidential: Boolean(c.confidential),
        slaDueAt: toEpochMs(c.slaDueAt),
        createdAt: toEpochMsOr(c.createdAt, Date.now()),
        updatedAt: toEpochMsOr(c.updatedAt, Date.now()),
        resolvedAt: toEpochMs(c.resolvedAt),
        closedAt: toEpochMs(c.closedAt),
        studentName: nameOf(c.studentId),
        assigneeName: nameOf(c.assigneeId),
      },
      timeline: timeline.map((t) => ({
        ...t,
        createdAt: toEpochMsOr(t.createdAt, Date.now()),
        actorName: nameOf(t.actorId),
      })),
      comments: visibleComments.map((m) => ({
        id: m.id,
        body: m.body,
        visibility: m.visibility,
        kind: m.kind,
        authorName: nameOf(m.authorId),
        isMine: m.authorId === user.id,
        createdAt: toEpochMsOr(m.createdAt, Date.now()),
      })),
      photos: showPhotos ? photos.map((p) => ({ ...p, url: `/api/photos/${p.id}`, kind: p.kind })) : [],
      allowed: allowedTransitions(c.status),
      me: { id: user.id, role: user.role, name: user.name },
      isReporter: c.studentId === user.id,
      staffish,
    };
  });
