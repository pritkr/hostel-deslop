import { z } from "zod";

/**
 * Roles are a closed set, not free strings. Every authorization decision in the
 * app compares `user.role` against a literal, so modelling it as a union makes
 * a typo a compile error and lets the "is this user staff" checks be shared
 * rather than re-spelled as inline `.includes()` calls on a `string[]`.
 */
export const USER_ROLES = ["student", "staff", "warden", "admin"] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Roles that reach every hostel rather than exactly one. */
export const CAMPUS_WIDE_ROLES: readonly UserRole[] = ["staff", "admin"];

export const STAFF_ROLES: readonly UserRole[] = ["staff", "warden", "admin"];

/** Roles that may act on behalf of a single building: the warden and the admin. */
export const WARDEN_ROLES: readonly UserRole[] = ["warden", "admin"];

export const userRoleSchema = z.enum(USER_ROLES);

const USER_ROLE_SET: ReadonlySet<string> = new Set(USER_ROLES);

const STAFF_ROLE_SET: ReadonlySet<string> = new Set(STAFF_ROLES);

const WARDEN_ROLE_SET: ReadonlySet<string> = new Set(WARDEN_ROLES);

export function isUserRole(value: string): value is UserRole {
  return USER_ROLE_SET.has(value);
}

export function isStaffRole(role: string): role is UserRole {
  return STAFF_ROLE_SET.has(role);
}

export function isWardenRole(role: string): role is UserRole {
  return WARDEN_ROLE_SET.has(role);
}
