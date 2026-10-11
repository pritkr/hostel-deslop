import { eq } from "drizzle-orm";
import type { AppDb } from "./index";
import { HOSTELS } from "../utils/catalog";

const DDL = [
  `CREATE TABLE IF NOT EXISTS "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, emailVerified INTEGER NOT NULL DEFAULT 0, image TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'student', banned INTEGER NOT NULL DEFAULT 0, banReason TEXT, banExpires INTEGER, rollNo TEXT UNIQUE, dept TEXT, year INTEGER, phone TEXT, hostelId TEXT, roomId TEXT, gender TEXT)`,
  `CREATE TABLE IF NOT EXISTS "session" (id TEXT PRIMARY KEY, expiresAt INTEGER NOT NULL, token TEXT NOT NULL UNIQUE, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, ipAddress TEXT, userAgent TEXT, userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, impersonatedBy TEXT)`,
  `CREATE TABLE IF NOT EXISTS "account" (id TEXT PRIMARY KEY, accountId TEXT NOT NULL, providerId TEXT NOT NULL, userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, accessToken TEXT, refreshToken TEXT, idToken TEXT, accessTokenExpiresAt INTEGER, refreshTokenExpiresAt INTEGER, scope TEXT, password TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "verification" (id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, expiresAt INTEGER NOT NULL, createdAt INTEGER, updatedAt INTEGER)`,
  `CREATE TABLE IF NOT EXISTS "hostels" (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'boys', floors INTEGER NOT NULL DEFAULT 3, wardenId TEXT, caretakerName TEXT, caretakerPhone TEXT, createdAt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "rooms" (id TEXT PRIMARY KEY, hostelId TEXT NOT NULL REFERENCES hostels(id), floor INTEGER NOT NULL, roomNo TEXT NOT NULL, capacity INTEGER NOT NULL DEFAULT 3, createdAt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "complaints" (id TEXT PRIMARY KEY, seq INTEGER NOT NULL, studentId TEXT NOT NULL REFERENCES "user"(id), hostelId TEXT NOT NULL REFERENCES hostels(id), roomId TEXT REFERENCES rooms(id), floor INTEGER, roomLabel TEXT, category TEXT NOT NULL, subType TEXT, title TEXT NOT NULL, description TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'submitted', confidential INTEGER NOT NULL DEFAULT 0, assigneeId TEXT REFERENCES "user"(id), slaDueAt INTEGER, overdue INTEGER NOT NULL DEFAULT 0, resolvedAt INTEGER, closedAt INTEGER, rating INTEGER, ratingNote TEXT, duplicateOfId TEXT, upvotes INTEGER NOT NULL DEFAULT 0, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "complaint_photos" (id TEXT PRIMARY KEY, complaintId TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE, r2Key TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'before', mimeType TEXT, sizeBytes INTEGER, createdAt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "activities" (id TEXT PRIMARY KEY, complaintId TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE, actorId TEXT REFERENCES "user"(id), actorRole TEXT, fromStatus TEXT, toStatus TEXT, remark TEXT, createdAt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "comments" (id TEXT PRIMARY KEY, complaintId TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE, authorId TEXT NOT NULL REFERENCES "user"(id), body TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT 'public', kind TEXT NOT NULL DEFAULT 'message', createdAt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "upvotes" (id TEXT PRIMARY KEY, complaintId TEXT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE, userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, createdAt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "notices" (id TEXT PRIMARY KEY, hostelId TEXT, authorId TEXT NOT NULL REFERENCES "user"(id), title TEXT NOT NULL, body TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "sla_policies" (id TEXT PRIMARY KEY, respondHours INTEGER NOT NULL, resolveHours INTEGER NOT NULL, updatedAt INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "counters" (id TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0, updatedAt INTEGER NOT NULL)`,
];

/**
 * DDL is not part of the Drizzle query-builder surface: `AppDb` has no `run`
 * member. Both drivers the app uses (D1 and the local proxy) do expose one, and
 * the result of a DDL statement carries nothing this code reads.
 */
type RawStatementRunner = { run: (query: RawSql) => Promise<void> };

type RawSql = ReturnType<typeof import("drizzle-orm").sql.raw>;

function rawRunner(db: AppDb): RawStatementRunner {
  // SAFETY: `run` is the documented way to execute DDL through Drizzle and is
  // present on both the D1 and local-proxy drivers. The surface is narrowed to
  // `run` alone, so nothing else about the database can be assumed here.
  const withRun = db as AppDb & Partial<RawStatementRunner>;

  return { run: (query) => withRun.run!(query) };
}

export async function ensureLocalSchema(db: AppDb) {
  const runner = rawRunner(db);
  const { sql } = await import("drizzle-orm");

  for (const s of DDL) await runner.run(sql.raw(s));
  await runner.run(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS idx_c_hostel ON complaints(hostelId, status)`,
    ),
  );
  await runner.run(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS idx_c_assignee ON complaints(assigneeId, status)`,
    ),
  );
  await runner.run(
    sql.raw(`CREATE INDEX IF NOT EXISTS idx_c_student ON complaints(studentId)`),
  );

  // Databases created before these columns existed still need them. Each ALTER
  // is attempted separately and its failure ignored — SQLite has no
  // "ADD COLUMN IF NOT EXISTS", and a duplicate-column error is the success
  // case here, not a failure.
  for (const add of [
    `ALTER TABLE comments ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'`,
    `ALTER TABLE comments ADD COLUMN kind TEXT NOT NULL DEFAULT 'message'`,
  ]) {
    try {
      await runner.run(sql.raw(add));
    } catch {
      /* column already present */
    }
  }

  await ensureReferenceData(db);
}

/**
 * Reference rows the app cannot function without: the three hostels (every
 * complaint carries a foreign key to one), the SLA defaults, and the sequence
 * counter. Every insert is a no-op when the row already exists, so this is
 * safe to call on every request and safe to run concurrently.
 */
export async function ensureReferenceData(db: AppDb) {
  const { slaPolicies, counters, hostels, rooms } = await import("./schema");
  const { seedSlaDefaults } = await import("./activity-tables");

  for (const p of seedSlaDefaults) {
    await db
      .insert(slaPolicies)
      .values({ ...p, updatedAt: new Date() })
      .onConflictDoNothing({ target: slaPolicies.id });
  }

  await db
    .insert(counters)
    .values({ id: "complaint_seq", value: 0, updatedAt: new Date() })
    .onConflictDoNothing({ target: counters.id });

  for (const h of HOSTELS) {
    await db
      .insert(hostels)
      .values({ ...h, createdAt: new Date() })
      .onConflictDoNothing({ target: hostels.id });
  }

  // The room list every resident picks from when reporting a fault. This table
  // has existed since the first migration but was never populated, which is why
  // the complaint form could only offer a free-text room box. Rooms are derived
  // (not registered) so the whole inventory fits in one deterministic pass:
  // four floors of ten rooms per hostel, matching the `floors` value above.
  const existing = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(eq(rooms.hostelId, "BH1"))
    .limit(1);

  if (existing.length === 0) {
    const seed: (typeof rooms.$inferInsert)[] = [];

    for (const h of HOSTELS) {
      for (let floor = 1; floor <= h.floors; floor++) {
        for (let n = 1; n <= 10; n++) {
          const roomNo = `${floor}${String(n).padStart(2, "0")}`;
          seed.push({
            id: `${h.id}-${roomNo}`,
            hostelId: h.id,
            floor,
            roomNo,
            capacity: 3,
            createdAt: new Date(),
          });
        }
      }
    }

    // D1 caps bound parameters per statement, so the inventory is inserted in
    // small batches. A single 120-row insert exceeds the limit and fails.
    for (let i = 0; i < seed.length; i += 10) {
      await db
        .insert(rooms)
        .values(seed.slice(i, i + 10))
        .onConflictDoNothing({ target: rooms.id });
    }
  }
}
