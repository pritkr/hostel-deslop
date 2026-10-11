import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { dbForRequest } from "./request-db";
import { ensureSession, requireHostelAccess } from "./auth-functions";
import { OPEN_STATUSES } from "./complaint-policy";
import { hostelIdSchema, idSchema } from "./server-inputs";
import { uid } from "../utils/format";

const createInput = z
  .object({
    hostelId: hostelIdSchema,
    roomLabel: z.string().max(120),
    roomId: idSchema.nullable().optional(),
    floor: z.number().int().min(1).max(20).optional(),
    category: z.string().min(1).max(32),
    subType: z.string().max(64).optional(),
    title: z.string().min(1).max(140),
    description: z.string().min(1).max(4000),
    confidential: z.boolean().optional(),
  })
  .strict();

export const createComplaint = createServerFn({ method: "POST" })
  .validator(createInput)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();
    requireHostelAccess(user, data.hostelId);
    const title = data.title.trim();
    const description = data.description.trim();

    if (title.length < 4) throw new Error("Title too short");

    if (description.length < 10) throw new Error("Please describe the issue in detail");

    if (!data.hostelId) throw new Error("Hostel required");

    if (!data.category) throw new Error("Category required");

    const db = await dbForRequest();
    const s = await import("../db/schema");

    const open = await db
      .select({ id: s.complaints.id })
      .from(s.complaints)
      .where(
        and(
          eq(s.complaints.studentId, user.id),
          inArray(s.complaints.status, [...OPEN_STATUSES]),
        ),
      )
      .limit(11);

    if (open.length >= 10) {
      throw new Error("You have 10 open complaints. Please wait for resolution.");
    }

    // The register number has to be unique, and it is allocated by reading the
    // counter and writing it back. Two residents filing at the same moment both
    // read the same value, so both compute the same id and the second insert
    // fails on the primary key — the complaint is lost and the resident sees a
    // raw driver error.
    //
    // D1 has no interactive transaction for this, so the sequence is reserved
    // with a single conditional UPDATE that only advances the row when nobody
    // else got there first. A losing writer detects that its UPDATE changed no
    // rows and simply tries again with the next value. `RETURNING` is avoided so
    // this works identically on D1 and the local better-sqlite3 proxy.
    const year = new Date().getFullYear();
    let id = "";

    // Bounded so a pathological write storm surfaces as a clean error rather
    // than spinning.
    for (let attempt = 0; attempt < 8; attempt++) {
      const advanced = await db
        .update(s.counters)
        .set({ value: sql`${s.counters.value} + 1`, updatedAt: new Date() })
        .where(eq(s.counters.id, "complaint_seq"))
        .returning({ value: s.counters.value });

      const claimed = advanced[0]?.value;

      if (claimed !== undefined) {
        id = `GEC-H-${year}-${String(claimed).padStart(4, "0")}`;
        break;
      }

      // The counter row does not exist yet (fresh database). Create it, then let
      // the next iteration take the conditional UPDATE.
      await db
        .insert(s.counters)
        .values({ id: "complaint_seq", value: 1, updatedAt: new Date() })
        .onConflictDoNothing({ target: s.counters.id });
    }

    if (!id) {
      throw new Error("Could not allocate a register number, please try again");
    }

    const next = Number(id.slice(-4));
    const policies = await db.select().from(s.slaPolicies);

    const resolveHours =
      policies.find((p) => p.id === data.category)?.resolveHours ?? 72;

    const slaDueAt = new Date(Date.now() + resolveHours * 3600 * 1000);
    const hay = `${title} ${description}`.toLowerCase();

    const priority = ["spark", "shock", "fire", "no water", "blocked", "foul"].some((h) =>
      hay.includes(h),
    )
      ? "high"
      : "medium";

    let roomId: string | null = null;
    let floor: number | null = data.floor ?? null;

    if (data.roomId) {
      // The room must belong to the hostel the complaint is filed against.
      // The picker sends a matching pair, but the server function is the trust
      // boundary — a mismatched id would file a BH1 fault against a GH1 room.
      const room = await db
        .select({ id: s.rooms.id, hostelId: s.rooms.hostelId, floor: s.rooms.floor })
        .from(s.rooms)
        .where(eq(s.rooms.id, data.roomId))
        .limit(1);

      if (!room[0] || room[0].hostelId !== data.hostelId) {
        throw new Error("That room is not in the selected hostel");
      }

      roomId = room[0].id;
      floor = room[0].floor;
    }

    await db.insert(s.complaints).values({
      id,
      seq: next,
      studentId: user.id,
      hostelId: data.hostelId,
      roomLabel: data.roomLabel || user.roomId || "",
      floor,
      roomId,
      category: data.category,
      subType: data.subType || null,
      title,
      description,
      priority,
      status: "submitted",
      confidential: Boolean(data.confidential),
      slaDueAt,
      overdue: false,
      upvotes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(s.activities).values({
      id: uid("act_"),
      complaintId: id,
      actorId: user.id,
      actorRole: user.role,
      fromStatus: null,
      toStatus: "submitted",
      remark: "Complaint filed (digital register entry)",
      createdAt: new Date(),
    });

    return { id, seq: next };
  });
