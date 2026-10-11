import { z } from "zod";

/**
 * Input schemas shared by the server functions.
 *
 * Every server function is reachable from a browser, so its payload is
 * untrusted by construction. These schemas are the boundary: a handler only
 * ever sees values that have already been length-bounded and stripped of
 * unexpected keys, which is why no handler re-checks its own arguments.
 *
 * `.strict()` is the important default. A silently-ignored extra key usually
 * means a client and server disagree about the contract, and dropping it at the
 * boundary turns that disagreement into a loud failure instead of a quiet one.
 */

/** Ids are opaque strings minted by `uid()`; 64 chars covers every prefix. */
export const idSchema = z.string().min(1).max(64);

/** Hostel ids are short fixed slugs such as `BH1`. */
export const hostelIdSchema = z.string().min(1).max(16);

/** A single row addressed by primary key. */
export const idInput = z.object({ id: idSchema }).strict();

/** The same, for a GET that may be called with no arguments at all. */
export const noInput = z.object({}).strict().default({});

/** An optional hostel filter; absent means "campus-wide" for privileged roles. */
export const optionalHostelInput = z
  .object({ hostelId: hostelIdSchema.optional() })
  .strict()
  .default({});

/** A free-text reason attached to an audit-timeline entry. */
export const reasonSchema = z.string().max(200).optional();
