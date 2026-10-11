import { asc, eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { dbForRequest } from "./request-db";
import { ensureSession, requireHostelAccess } from "./auth-functions";
import { hostelIdSchema } from "./server-inputs";

const listRoomsInput = z.object({ hostelId: hostelIdSchema }).strict();

/**
 * The room inventory for one hostel, ordered the way a resident reads a
 * building: floor first, then room number. This is the backing data for the
 * room picker — without it the complaint form can only accept free text, which
 * is how "Room 2O3" and "203" end up as two different repairs.
 */
export const listRooms = createServerFn({ method: "GET" })
  .validator(listRoomsInput)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();
    // Room numbers reveal the occupancy layout of a building, so the inventory
    // is scoped exactly like the complaints that reference it.
    requireHostelAccess(user, data.hostelId);
    const db = await dbForRequest();
    const s = await import("../db/schema");

    return await db
      .select({
        id: s.rooms.id,
        floor: s.rooms.floor,
        roomNo: s.rooms.roomNo,
        capacity: s.rooms.capacity,
      })
      .from(s.rooms)
      .where(eq(s.rooms.hostelId, data.hostelId))
      .orderBy(asc(s.rooms.floor), asc(s.rooms.roomNo));
  });