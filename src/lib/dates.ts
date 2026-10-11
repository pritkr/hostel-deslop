/**
 * Timestamps reach this app in exactly two forms: as a `Date` decoded by Drizzle
 * from a `mode: "timestamp_ms"` column, or as a raw number/ISO string that
 * crossed a transport boundary (a JSON-decoded row, a query param, a value read
 * through a driver that returned the underlying integer).
 *
 * These helpers are the single place that conversion happens. They exist so no
 * call site has to write `new Date(value as string)`, which was a redundant
 * re-wrap of an already-decoded `Date` and quietly wrong for the numeric case.
 *
 * A malformed timestamp has a correct answer (`null`) rather than a rejection,
 * so the schema is queried with `safeParse` instead of `parse`. That distinction
 * is the whole reason this module owns the conversion: it is the one place
 * where an unparseable value is an expected outcome rather than a bug.
 */

import { z } from "zod";

/** A timestamp in any of the forms this app can receive. */
export type EpochInput = Date | number | string | null | undefined;

/** Parses the transport-boundary string form, or rejects it. */
const epochStringSchema = z
  .string()
  .transform((value) => new Date(value).getTime())
  .refine((ms) => !Number.isNaN(ms), { message: "not a parseable date" });

/**
 * Every accepted timestamp form in one schema. Using the schema rather than a
 * chain of `instanceof`/`typeof` checks means the accepted set is declared in
 * one place: a `Date` from Drizzle, a raw integer from a driver, or an ISO
 * string from a transport boundary.
 */
const epochSchema = z.union([z.date(), z.number(), epochStringSchema]);

function toFiniteNumber(parsed: { success: true; data: number | Date } | { success: false }): number | null {
  if (!parsed.success) return null;

  const ms = parsed.data instanceof Date ? parsed.data.getTime() : parsed.data;

  return Number.isNaN(ms) ? null : ms;
}

/** Epoch milliseconds, or `null` for an absent, empty or unparseable value. */
export function toEpochMs(value: EpochInput): number | null {
  if (value === null || value === undefined || value === "") return null;

  return toFiniteNumber(epochSchema.safeParse(value));
}

/**
 * Epoch milliseconds with a fallback, for a timestamp that is required to exist.
 *
 * A NOT NULL `timestamp_ms` column cannot produce `null`, so a missing value
 * here means the row was not decoded by Drizzle — the local driver fallback —
 * rather than that the data is genuinely absent.
 */
export function toEpochMsOr(value: EpochInput, fallback: number): number {
  return toEpochMs(value) ?? fallback;
}

/** Epoch milliseconds with `Date.now()` as the fallback for required stamps. */
export function toEpochMsFallback(value: EpochInput): number {
  return toEpochMs(value) ?? Date.now();
}

/** Whole days between two timestamps, for SLA reporting. */
export function daysBetween(fromMs: number, toMs: number): number {
  return (toMs - fromMs) / 86_400_000;
}
