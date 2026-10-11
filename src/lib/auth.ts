import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { admin } from "better-auth/plugins";
import { z } from "zod";
import { getDb, type ServerBindings } from "../db/index";
import { ensureLocalSchema } from "../db/ensure";
import * as schema from "../db/schema";

/**
 * A submitted roll number, or absent when the claim is blank or malformed.
 *
 * `rollNo` reaches this hook as a form-encoded value, so parsing it here is the
 * point where an unverified claim becomes either a searchable string or nothing.
 */
const rollNoSchema = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value === "" ? null : value))
  .catch(null);

// Per-request auth factory (Workers-safe): D1 binding differs per request,
// so we cannot use a module-level singleton bound to one DB.
export async function createAuth(env?: ServerBindings) {
  const db = await getDb(env);

  // Local fallback needs tables; D1 uses migrations.
  if (!env?.DB) {
    try {
      await ensureLocalSchema(db);
    } catch {
      /* best effort */
    }
  }

  // baseURL is only pinned when it is explicitly configured (production, via a
  // var). Left unset, Better Auth derives it from the incoming request, which
  // is what keeps local dev working when Vite lands on a different port than
  // the one the .env file guesses. `trustedOrigins` covers the same case for
  // the CSRF check, which compares the Origin header against this list.
  const configuredUrl = env?.BETTER_AUTH_URL ?? process.env.BETTER_AUTH_URL;

  // The signing key must never silently degrade to a value that is published in
  // this repository. If it is missing, anyone can read the literal, forge a
  // session cookie for any user id — including the chief warden — and the
  // forgery is indistinguishable from a real login.
  //
  // A hardcoded fallback is only acceptable while developing locally, so it is
  // gated on an explicitly non-production signal. Cloudflare Workers does not
  // set NODE_ENV, so `BETTER_AUTH_SECRET` being absent is treated as production:
  // a deployed Worker that reaches this point fails loudly instead of running
  // wide open.
  const configuredSecret = env?.BETTER_AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET;

  const isLocalDev = process.env.NODE_ENV !== "production" && !env?.DB;

  if (!configuredSecret && !isLocalDev) {
    throw new Error(
      "BETTER_AUTH_SECRET is not set. Refusing to start with the built-in " +
        "development signing key. Set it with `wrangler secret put " +
        "BETTER_AUTH_SECRET` (see README, Deploy section).",
    );
  }

  // baseURL is omitted entirely when unconfigured so Better Auth derives it from
  // the incoming request; passing an explicit undefined is not equivalent.
  const baseUrlOption = configuredUrl ? { baseURL: configuredUrl } : {};

  return betterAuth({
    secret: configuredSecret ?? "dev-secret-key-that-is-at-least-32-chars-long-123456",
    ...baseUrlOption,
    trustedOrigins: [
      "http://localhost",
      "http://127.0.0.1",
      ...Array.from({ length: 30 }, (_, i) => `http://localhost:${3000 + i}`),
    ],
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    // Better Auth's built-in rate limiter defaults to `enabled: isProduction`,
    // and isProduction is `NODE_ENV === "production"`. Cloudflare Workers never
    // sets NODE_ENV, so that default silently evaluates to false and the limiter
    // is OFF in production while looking configured. It is therefore enabled
    // explicitly here rather than left to the environment-derived default.
    //
    // Storage is "memory", which is per-isolate: on Workers this throttles a
    // single warm instance rather than the account globally. It is still far
    // better than nothing, and moving it to a shared KV/D1 store is the fix if
    // this app is ever exposed to sustained automated traffic.
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        // Credential endpoints get a much tighter budget than the global one.
        // 20/minute is still far below anything a human types — it stops
        // credential stuffing and scripted signup floods, while leaving room for
        // a shared NAT egress IP where several residents log in at once.
        // The QA suite signs in as five seeded roles on every run, so the floor
        // has to sit above that.
        "/sign-in/email": { window: 60, max: 20 },
        "/sign-up/email": { window: 60, max: 5 },
      },
    },
    emailAndPassword: {
      enabled: true,
      // Signup creates a real account tied to a roll number and a hostel, so an
      // unverified address is an unproven claim of identity. Verification needs
      // an email provider (see .env.example, Phase 2) — until one is configured
      // this stays false rather than locking every resident out of their
      // own account.
      requireEmailVerification: false,
      // Caps the damage credential stuffing can do with a handful of guesses.
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    user: {
      additionalFields: {
        role: { type: "string", defaultValue: "student", required: false },
        rollNo: { type: "string", required: false },
        dept: { type: "string", required: false },
        year: { type: "number", required: false },
        phone: { type: "string", required: false },
        hostelId: { type: "string", required: false },
        roomId: { type: "string", required: false },
        gender: { type: "string", required: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (u) => {
            // A signup with a whitespace-only roll number is an unproven claim,
            // so it is normalised to absent rather than stored as a value that
            // looks present but cannot be searched.
            return { data: { ...u, rollNo: rollNoSchema.parse(u.rollNo) } };
          },
        },
      },
    },
    plugins: [admin({ defaultRole: "student", adminRoles: ["admin"] }), tanstackStartCookies()],
  });
}

export type Auth = Awaited<ReturnType<typeof createAuth>>;
