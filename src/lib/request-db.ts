import { getDb } from "../db/index";
import { ensureLocalSchema, ensureReferenceData } from "../db/ensure";
import { getServerEnv } from "./server-env";

/**
 * Request-scoped database — the single seam every server function reaches
 * the database through.
 *
 * Previously this lived on the complaint-list feature module, so deleting or
 * renaming one feature file broke eight unrelated server modules (actions,
 * board, photos, shift, admin, notices, rooms, directory). The interface is
 * the test surface: one function, no feature vocabulary.
 *
 * Two runtimes, two migration stories: under Workers D1 applies migrations
 * but never inserts the hostel/SLA/counter rows every complaint references,
 * so reference data is guaranteed here. Under plain Node neither exists yet,
 * so the local schema is created first.
 *
 * Both guarantees are memoized per process. Without this every request paid
 * for ~15 idempotent writes (11 SLA policies + counter + 3 hostels + a rooms
 * probe) before doing its real work — the most expensive lines in the app
 * were the ones that ran before the query.
 */

let localSchemaDone = false;

let localSchemaPromise: Promise<void> | null = null;

// D1 reference rows are static. Re-inserting them on every request is pure
// write amplification, so the guarantee is cached per isolate with a TTL.
// A failed seed clears the cache so the next request retries instead of
// serving an empty room picker for the next hour.
let refSeededAt = 0;

let refPromise: Promise<void> | null = null;

const REF_TTL_MS = 5 * 60 * 1000;

function ensureLocalSchemaOnce(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  if (localSchemaDone) return Promise.resolve();

  if (localSchemaPromise) return localSchemaPromise;
  localSchemaPromise = ensureLocalSchema(db)
    .then(() => {
      localSchemaDone = true;
    })
    .catch(() => {
      // A failed DDL run must be retryable, not permanently cached as done.
      localSchemaPromise = null;
    });

  return localSchemaPromise;
}

function ensureReferenceDataCached(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  const now = Date.now();

  if (refPromise && now - refSeededAt < REF_TTL_MS) return refPromise;
  refPromise = ensureReferenceData(db)
    .then(() => {
      refSeededAt = Date.now();
    })
    .catch((e) => {
      // Swallowing this silently is how a failed seed ships as an empty room
      // picker, so it is logged rather than hidden — and the cache is cleared
      // so the next request tries again.
      console.error("[ensure] reference data seed failed:", e);
      refPromise = null;
    });

  return refPromise;
}

export async function dbForRequest() {
  const env = await getServerEnv();
  const db = await getDb(env);

  if (!env.DB) {
    await ensureLocalSchemaOnce(db).catch(() => {
      /* best effort: a missing local table surfaces as the query error */
    });
  } else {
    await ensureReferenceDataCached(db);
  }

  return db;
}
