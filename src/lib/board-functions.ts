import { desc, eq, inArray } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";

import { dbForRequest } from "./request-db";
import { ensureSession, requireHostelAccess } from "./auth-functions";
import { canSeeConfidential, isOpenStatus } from "./complaint-policy";
import { optionalHostelInput } from "./server-inputs";
import { toEpochMs, toEpochMsFallback } from "./dates";

/**
 * One board read for every mobile view: resident bulletin, staff shift slate,
 * warden needs-attention. Slices are views of the same work records — no
 * shadow queues. Ordering follows the plan: staff-confirmed safety/essential
 * impact first, then overdue, then oldest work.
 */
export const hostelBoard = createServerFn({ method: "GET" })
  .validator(optionalHostelInput)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();
    const db = await dbForRequest();
    const s = await import("../db/schema");
    const hostelId = data.hostelId ?? user.hostelId ?? "BH1";
    // Students and wardens are pinned to their own building. Staff and admins
    // keep the campus-wide reach the hostel switcher in the UI already grants.
    requireHostelAccess(user, data.hostelId);

    const all = await db
      .select()
      .from(s.complaints)
      .where(eq(s.complaints.hostelId, hostelId))
      .orderBy(desc(s.complaints.createdAt))
      .limit(200);

    const visible = all.filter((c) => canSeeConfidential(user, c));

    const visibleIds = visible.map((c) => c.id);

    // Latest truthful event per item drives "blocked" and "no update since".
    const events = visibleIds.length
      ? await db
          .select()
          .from(s.activities)
          .where(inArray(s.activities.complaintId, visibleIds))
          .orderBy(desc(s.activities.createdAt))
          .limit(600)
      : [];

    const lastByComplaint = new Map<string, (typeof events)[number]>();

    for (const e of events) if (!lastByComplaint.has(e.complaintId)) lastByComplaint.set(e.complaintId, e);

    const ids = new Set<string>();
    visible.forEach((c) => {
      ids.add(c.studentId);

      if (c.assigneeId) ids.add(c.assigneeId);
    });
    events.forEach((e) => e.actorId && ids.add(e.actorId));
    const people = ids.size ? await db.select().from(s.user).where(inArray(s.user.id, [...ids])) : [];
    const personById = new Map(people.map((p) => [p.id, p]));
    const nameOf = (id: string | null) => (id ? (personById.get(id)?.name ?? null) : null);
    const roleOf = (id: string | null) => (id ? (personById.get(id)?.role ?? null) : null);

    const map = (c: (typeof visible)[number]) => {
      const last = lastByComplaint.get(c.id);

      return {
        id: c.id, seq: c.seq, title: c.title, description: c.description,
        category: c.category, subType: c.subType, status: c.status, priority: c.priority,
        hostelId: c.hostelId, roomLabel: c.roomLabel, upvotes: c.upvotes ?? 0,
        overdue: Boolean(c.overdue),
        slaDueAt: toEpochMs(c.slaDueAt),
        createdAt: toEpochMsFallback(c.createdAt), updatedAt: toEpochMsFallback(c.updatedAt),
        assigneeName: nameOf(c.assigneeId), assigneeRole: roleOf(c.assigneeId),
        assigneeId: c.assigneeId, confidential: Boolean(c.confidential),
        lastEventAt: last ? toEpochMs(last.createdAt) : null,
        lastRemark: last?.remark ?? null,
        blocked: Boolean(last?.remark?.startsWith("Blocked")),
      };
    };

    const ranked = visible
      .filter((c) => isOpenStatus(c.status))
      .map(map)
      .sort((a, b) => {
        const rank = (x: typeof a) => (x.category === "safety" ? 0 : x.overdue ? 1 : 2);

        return rank(a) - rank(b) || a.createdAt - b.createdAt;
      });

    const now = Date.now();
    const endOfToday = new Date(new Date().setHours(23, 59, 59, 999)).getTime();
    const staleMs = 3 * 86400000;
    const mapped = visible.map(map);
    const scopeRank = (a: typeof mapped[number], b: typeof mapped[number]) => a.createdAt - b.createdAt;

    const unresolved = ranked;
    const repaired = mapped.filter((c) => ["resolved", "closed"].includes(c.status)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);
    const overdue = ranked.filter((c) => c.overdue);
    const stalled = ranked.filter((c) => !c.overdue && now - (c.lastEventAt ?? c.updatedAt) > staleMs);
    const blocked = ranked.filter((c) => c.blocked);
    const disputed = mapped.filter((c) => c.status === "reopened").sort(scopeRank);
    const unassigned = ranked.filter((c) => !c.assigneeId);
    const mine = ranked.filter((c) => c.assigneeId === user.id);
    const carry = ranked.filter((c) => now - c.createdAt > 2 * 86400000 && c.status !== "submitted").sort(scopeRank);

    const dueToday = ranked
      .filter((c) => c.slaDueAt !== null && c.slaDueAt <= endOfToday && c.status !== "resolved")
      .sort((a, b) => (a.slaDueAt ?? 0) - (b.slaDueAt ?? 0));

    // "Since my last check" strip for the warden: real events, not vanity metrics.
    const complaintById = new Map(visible.map((c) => [c.id, c]));

    const since = events
      .filter((e) => now - toEpochMsFallback(e.createdAt) < 24 * 3600000)
      .slice(0, 12)
      .map((e) => {
        const c = complaintById.get(e.complaintId);

        return {
          id: e.id,
          complaintId: e.complaintId,
          title: c?.title ?? "Work item",
          remark: e.remark,
          fromStatus: e.fromStatus,
          toStatus: e.toStatus,
          actorName: nameOf(e.actorId),
          createdAt: toEpochMsFallback(e.createdAt),
        };
      });

    return { hostelId, unresolved, repaired, overdue, stalled, blocked, disputed, unassigned, mine, carry, dueToday, since };
  });
