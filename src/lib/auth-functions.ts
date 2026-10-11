import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { createAuth } from "./auth";
import { isStaffRole, userRoleSchema, type UserRole } from "./auth-fields";
import { getServerEnv } from "./server-env";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  rollNo: string | null;
  hostelId: string | null;
  roomId: string | null;
  dept: string | null;
  year: number | null;
};

/**
 * Projects a Better Auth session user onto the shape the app authorizes with.
 *
 * The `additionalFields` declared in ./auth-augment.d.ts give the session user a
 * typed `role` and the hostel/room columns, so this is a narrowing of already-typed
 * evidence rather than a re-parse of an untyped record. `parseUserRole` is the one
 * place a role from storage is trusted: an unrecognised value becomes `student`,
 * never a broader role.
 */
function toSessionUser(user: AuthSessionUser): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    // Better Auth's admin plugin can write a role this app's schema does not
    // know about. An unrecognised or absent role resolves to `student`, the
    // least-privileged member of the set, rather than being trusted.
    role: userRoleSchema.catch("student").parse(user.role),
    rollNo: user.rollNo ?? null,
    hostelId: user.hostelId ?? null,
    roomId: user.roomId ?? null,
    dept: user.dept ?? null,
    year: user.year ?? null,
  };
}

type AuthSession = NonNullable<
  Awaited<ReturnType<Awaited<ReturnType<typeof createAuth>>["api"]["getSession"]>>
>;

type AuthSessionUser = AuthSession["user"];

/** Reads the current session, or `null` when there is no authenticated user. */
export const getSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ user: SessionUser } | null> => {
    const auth = await createAuth(await getServerEnv());
    const session = await auth.api.getSession({ headers: getRequestHeaders() });

    if (!session?.user) return null;

    return { user: toSessionUser(session.user) };
  },
);

/** Reads the current session, rejecting the request when there is none. */
export const ensureSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ user: SessionUser }> => {
    const auth = await createAuth(await getServerEnv());
    const session = await auth.api.getSession({ headers: getRequestHeaders() });

    if (!session?.user) throw new Error("Unauthorized");

    return { user: toSessionUser(session.user) };
  },
);

export function requireRole(user: SessionUser, roles: readonly UserRole[]) {
  if (!roles.includes(user.role)) throw new Error("Forbidden");
}

export const isStaff = (user: SessionUser) => isStaffRole(user.role);

/**
 * A hostel is "in scope" for a user when they belong to it, or when their role
 * is not tied to a single building.
 *
 * Students and wardens live in exactly one hostel, so they must only ever read
 * work records from that building. Staff and admins are campus-wide by the
 * design of this app (the bulletin exposes a hostel switcher to precisely those
 * three roles), so they keep cross-building reach.
 *
 * This was the important gap: the board, complaint detail and room list each
 * accepted a caller-supplied `hostelId`, and only wardens were checked against
 * their own. A student could therefore read another building's board — including
 * the girls' hostel — by passing its id.
 */
export function canAccessHostel(
  user: SessionUser,
  hostelId: string | null | undefined,
): boolean {
  if (isStaff(user) && user.role !== "warden") return true;

  if (!hostelId) return true;

  if (!user.hostelId) return true; // unassigned account: no building to compare against

  return user.hostelId === hostelId;
}

/** Throws unless the user may read/write records belonging to `hostelId`. */
export function requireHostelAccess(
  user: SessionUser,
  hostelId: string | null | undefined,
) {
  if (!canAccessHostel(user, hostelId)) throw new Error("Forbidden: outside your hostel");
}
