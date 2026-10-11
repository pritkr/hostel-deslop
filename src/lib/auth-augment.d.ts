import type { UserRole } from "./auth-fields";

/**
 * Better Auth reads `user.additionalFields` to extend the session user at the
 * type level. Declaring them here means `auth.api.getSession()` already returns
 * `role`, `hostelId`, `roomId` and friends typed, instead of every consumer
 * re-widening the session to `Record<string, unknown>` and asserting each field
 * back to a concrete type.
 *
 * The runtime declarations in ./auth.ts must stay in sync with this file.
 * `auth-fields.ts` is the single source of truth for the field list.
 */
declare module "better-auth" {
  interface User {
    role: UserRole;
    rollNo?: string | null;
    dept?: string | null;
    year?: number | null;
    phone?: string | null;
    hostelId?: string | null;
    roomId?: string | null;
    gender?: string | null;
  }
}
