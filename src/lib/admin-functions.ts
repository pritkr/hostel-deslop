import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { dbForRequest } from "./request-db";
import { ensureSession } from "./auth-functions";
import { USER_ROLES, isUserRole, userRoleSchema } from "./auth-fields";
import { noInput, hostelIdSchema, idSchema } from "./server-inputs";
import { getServerEnv } from "./server-env";

export const adminStats = createServerFn({ method: "GET" })
  .validator(noInput)
  .handler(async () => {
    const { user } = await ensureSession();

    if (user.role !== "admin") throw new Error("Forbidden");
    const db = await dbForRequest();
    const s = await import("../db/schema");

    const [cRows, uRows] = await Promise.all([
      db.select({ status: s.complaints.status, category: s.complaints.category, hostelId: s.complaints.hostelId }).from(s.complaints).limit(2000),
      db.select({ id: s.user.id, role: s.user.role, hostelId: s.user.hostelId }).from(s.user).limit(2000),
    ]);

    const byStatus: Record<string, number> = {};
    const byCat: Record<string, number> = {};
    const byHostel: Record<string, number> = {};

    for (const r of cRows) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      byCat[r.category] = (byCat[r.category] ?? 0) + 1;
      byHostel[r.hostelId] = (byHostel[r.hostelId] ?? 0) + 1;
    }

    const byRole: Record<string, number> = {};

    for (const u of uRows) { byRole[u.role] = (byRole[u.role] ?? 0) + 1; }

    return { total: cRows.length, users: uRows.length, byStatus, byCat, byHostel, byRole };
  });

const roleFilter = z
  .object({ role: z.enum([...USER_ROLES, "all"]).optional() })
  .strict()
  .default({});

export const adminUsers = createServerFn({ method: "GET" })
  .validator(roleFilter)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();

    if (user.role !== "admin") throw new Error("Forbidden");
    const db = await dbForRequest();
    const s = await import("../db/schema");

    const rows = await db
      .select({ id: s.user.id, name: s.user.name, email: s.user.email, role: s.user.role, rollNo: s.user.rollNo, hostelId: s.user.hostelId, roomId: s.user.roomId, dept: s.user.dept })
      .from(s.user)
      .orderBy(desc(s.user.createdAt))
      .limit(200);

    return data.role && data.role !== "all" ? rows.filter((r) => r.role === data.role) : rows;
  });

const setRoleInput = z
  .object({ userId: idSchema, role: userRoleSchema, hostelId: hostelIdSchema.optional() })
  .strict();

export const adminSetRole = createServerFn({ method: "POST" })
  .validator(setRoleInput)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();

    if (user.role !== "admin") throw new Error("Forbidden");

    if (!isUserRole(data.role)) throw new Error("Bad role");
    const db = await dbForRequest();
    const s = await import("../db/schema");
    await db
      .update(s.user)
      .set({ role: data.role, hostelId: data.hostelId ?? null, updatedAt: new Date() })
      .where(eq(s.user.id, data.userId));

    return { ok: true };
  });

const createStaffInput = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(128),
    role: userRoleSchema,
    hostelId: hostelIdSchema.optional(),
  })
  .strict()
  // A staff account is the only thing this endpoint creates. Rejecting
  // `student` at the boundary means the handler never has to consider it.
  .refine((input) => input.role !== "student", {
    message: "Pick a staff role: staff, warden or admin",
    path: ["role"],
  });

/**
 * Better Auth's `createUser` returns its own envelope, and this app only needs
 * the new id. Parsing the envelope here is the boundary between that library's
 * response type and the single field used below.
 */
const createdUserResult = z.object({ user: z.object({ id: z.string().min(1) }) });

export const adminCreateStaff = createServerFn({ method: "POST" })
  .validator(createStaffInput)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();

    if (user.role !== "admin") throw new Error("Forbidden");

    const { createAuth } = await import("./auth");
    const auth = await createAuth(await getServerEnv());

    // Better Auth's admin plugin recognises only its own two roles ("admin" /
    // "user"), which are not the app's roles. The app role is therefore written
    // straight to the row afterwards instead of being smuggled through a field
    // that would silently mislabel the account.
    const created = await auth.api.createUser({
      body: {
        email: data.email,
        password: data.password,
        name: data.name,
        data: { hostelId: data.hostelId ?? null },
      },
    });

    const { id } = createdUserResult.parse(created).user;
    const db = await dbForRequest();
    const s = await import("../db/schema");

    await db
      .update(s.user)
      .set({ role: data.role, hostelId: data.hostelId ?? null, updatedAt: new Date() })
      .where(eq(s.user.id, id));

    return { id };
  });
