import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray, like, lte, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { dbForRequest } from "./request-db";
import { ensureSession, isStaff, requireHostelAccess } from "./auth-functions";
import { toEpochMs, toEpochMsOr, daysBetween } from "./dates";
import { OPEN_STATUSES, canSeeConfidential } from "./complaint-policy";
import { optionalHostelInput, hostelIdSchema } from "./server-inputs";

/**
 * Resident's own register + warden/staff filtered views. Confidential rows
 * are removed before shaping so an unrelated resident never learns they
 * exist; the policy predicate lives on the complaint-policy seam, not here.
 */

export type ComplaintListItem = {
  id: string;
  seq: number;
  title: string;
  category: string;
  subType: string | null;
  status: string;
  priority: string;
  hostelId: string;
  roomLabel: string | null;
  upvotes: number;
  overdue: boolean;
  slaDueAt: number | null;
  createdAt: number;
  studentName?: string;
  assigneeName?: string | null;
};

export { OPEN_STATUSES };

// A re-export keeps old import paths working while the seam moves to
// complaint-policy.ts. Remove once callers import from there directly.
export { dbForRequest } from "./request-db";

const CLOSED_STATUSES: readonly string[] = ["closed", "resolved"];

/** Resolves display names for a set of user ids without an N+1 query. */
function nameLookup<T extends { id: string; name: string }>(people: readonly T[]) {
  const byId = new Map(people.map((p) => [p.id, p.name]));

  return (id: string | null | undefined): string | null => (id ? (byId.get(id) ?? null) : null);
}

const listInput = z
  .object({
    scope: z.string().optional(),
    hostelId: hostelIdSchema.optional(),
    status: z.string().max(32).optional(),
    category: z.string().max(32).optional(),
    q: z.string().max(80).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .strict();

export const listComplaints = createServerFn({ method: "GET" })
  .validator(listInput)
  .handler(async ({ data }): Promise<ComplaintListItem[]> => {
    const { user } = await ensureSession();
    const db = await dbForRequest();
    const s = await import("../db/schema");
    const scope = data.scope ?? "mine";

    if (scope !== "mine" && !isStaff(user) && user.role !== "warden") {
      throw new Error("Forbidden");
    }

    const conds: SQL[] = [];

    if (scope === "mine") conds.push(eq(s.complaints.studentId, user.id));

    if (scope === "assigned") conds.push(eq(s.complaints.assigneeId, user.id));

    if (data.hostelId) {
      requireHostelAccess(user, data.hostelId);
      conds.push(eq(s.complaints.hostelId, data.hostelId));
    } else if (user.role === "warden" && user.hostelId && scope === "hostel") {
      conds.push(eq(s.complaints.hostelId, user.hostelId));
    }

    if (data.status && data.status !== "all") {
      conds.push(eq(s.complaints.status, data.status));
    }

    if (data.category && data.category !== "all") {
      conds.push(eq(s.complaints.category, data.category));
    }

    const q = (data.q ?? "").trim().slice(0, 80);

    if (q) {
      // LIKE wildcards in the query are escaped so "%" searches literally
      // instead of matching every row in the register.
      const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`);
      conds.push(
        or(
          like(s.complaints.title, `%${escaped}%`),
          like(s.complaints.description, `%${escaped}%`),
          like(s.complaints.id, `%${escaped}%`),
        )!,
      );
    }

    const where = conds.length > 1 ? and(...conds) : conds[0];

    const full = await db
      .select()
      .from(s.complaints)
      .where(where)
      .orderBy(desc(s.complaints.createdAt))
      .limit(Math.min(data.limit ?? 50, 200));

    const filtered = full.filter((c) => canSeeConfidential(user, c));
    const ids = new Set<string>();

    for (const c of filtered) {
      ids.add(c.studentId);

      if (c.assigneeId) ids.add(c.assigneeId);
    }

    const people =
      ids.size > 0
        ? await db.select().from(s.user).where(inArray(s.user.id, [...ids]))
        : [];

    const nameOf = nameLookup(people);

    return filtered.map((c) => ({
      id: c.id,
      seq: c.seq,
      title: c.title,
      category: c.category,
      subType: c.subType,
      status: c.status,
      priority: c.priority,
      hostelId: c.hostelId,
      roomLabel: c.roomLabel,
      upvotes: c.upvotes,
      overdue: Boolean(c.overdue),
      slaDueAt: toEpochMs(c.slaDueAt),
      createdAt: toEpochMsOr(c.createdAt, Date.now()),
      studentName: nameOf(c.studentId) ?? undefined,
      assigneeName: nameOf(c.assigneeId),
    }));
  });

export const dashboardStats = createServerFn({ method: "GET" })
  .validator(optionalHostelInput)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();

    if (data.hostelId) requireHostelAccess(user, data.hostelId);
    const db = await dbForRequest();
    const s = await import("../db/schema");
    const conds: SQL[] = [];

    if (user.role === "student") conds.push(eq(s.complaints.studentId, user.id));

    const hostelScope =
      data.hostelId ?? (user.role === "warden" ? (user.hostelId ?? undefined) : undefined);

    if (hostelScope) conds.push(eq(s.complaints.hostelId, hostelScope));

    if (user.role === "staff") conds.push(eq(s.complaints.assigneeId, user.id));

    const where = conds.length ? and(...conds) : undefined;

    const rows = await db
      .select({ status: s.complaints.status, overdue: s.complaints.overdue })
      .from(s.complaints)
      .where(where);

    const by: Record<string, number> = {};
    let overdue = 0;

    for (const r of rows) {
      by[r.status] = (by[r.status] ?? 0) + 1;

      if (r.overdue) overdue += 1;
    }

    const open = OPEN_STATUSES.reduce((sum, status) => sum + (by[status] ?? 0), 0);

    const closed = CLOSED_STATUSES.reduce((sum, status) => sum + (by[status] ?? 0), 0);

    // Resolution time is measured from the rows already scoped above. The cap
    // keeps the average cheap on a large table; without it a busy hostel would
    // make every dashboard load scan the whole history.
    const done = await db
      .select({ createdAt: s.complaints.createdAt, resolvedAt: s.complaints.resolvedAt })
      .from(s.complaints)
      .where(where)
      .limit(200);

    let totalMs = 0;
    let counted = 0;

    for (const d of done) {
      const created = toEpochMs(d.createdAt);
      const resolved = toEpochMs(d.resolvedAt);

      if (created === null || resolved === null) continue;

      totalMs += resolved - created;
      counted += 1;
    }

    return {
      total: rows.length,
      open,
      overdue,
      closed,
      by,
      avgDays: counted ? Number((daysBetween(0, totalMs / counted)).toFixed(1)) : 0,
    };
  });

/**
 * Marks open complaints past their SLA deadline. Runs on demand rather than on a
 * schedule because the flag it writes is derived state: recomputing it is always
 * safe, and a missed sweep self-heals on the next call.
 *
 * One UPDATE, not N: the old loop read 500 rows and issued an UPDATE per
 * overdue item, so a bad week meant hundreds of round trips. The predicate is
 * pushed into the WHERE clause — D1/Drizzle timestamp_ms columns compare as
 * epoch millis, which is what Date.now() already is.
 */
export const slaSweep = createServerFn({ method: "POST" }).handler(async () => {
  const { user } = await ensureSession();

  if (user.role !== "warden" && user.role !== "admin") throw new Error("Forbidden");

  const db = await dbForRequest();
  const s = await import("../db/schema");
  const now = new Date();

  const marked = await db
    .update(s.complaints)
    .set({ overdue: true, updatedAt: now })
    .where(and(inArray(s.complaints.status, [...OPEN_STATUSES]), lte(s.complaints.slaDueAt, now)));

  void marked;

  // Drizzle's D1 driver does not reliably return the affected-row count, so
  // the sweep reports what it set by re-reading the flag it just wrote.
  const overdue = await db
    .select({ id: s.complaints.id })
    .from(s.complaints)
    .where(and(inArray(s.complaints.status, [...OPEN_STATUSES]), eq(s.complaints.overdue, true)))
    .limit(500);

  return { marked: overdue.length };
});

export const staffList = createServerFn({ method: "GET" }).handler(async () => {
  const { user } = await ensureSession();

  if (user.role !== "warden" && user.role !== "admin") throw new Error("Forbidden");

  const db = await dbForRequest();
  const s = await import("../db/schema");

  return db
    .select({ id: s.user.id, name: s.user.name, role: s.user.role })
    .from(s.user)
    .where(inArray(s.user.role, ["staff", "warden", "admin"]))
    .limit(100);
});
