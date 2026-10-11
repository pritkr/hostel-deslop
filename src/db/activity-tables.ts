import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { complaints } from "./hostel-tables";
import { user } from "./auth-tables";

// Immutable audit trail — the digital register book.
export const activities = sqliteTable("activities", {
  id: text("id").primaryKey(),
  complaintId: text("complaintId")
    .notNull()
    .references(() => complaints.id, { onDelete: "cascade" }),
  actorId: text("actorId").references(() => user.id),
  actorRole: text("actorRole"),
  fromStatus: text("fromStatus"),
  toStatus: text("toStatus"),
  remark: text("remark"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  complaintId: text("complaintId")
    .notNull()
    .references(() => complaints.id, { onDelete: "cascade" }),
  authorId: text("authorId")
    .notNull()
    .references(() => user.id),
  body: text("body").notNull(),
  // "public" = visible to the hostel, "staff" = private to staff/warden.
  visibility: text("visibility").notNull().default("public"),
  // "message" = ordinary update, "signal" = still broken / record is wrong.
  kind: text("kind").notNull().default("message"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const upvotes = sqliteTable("upvotes", {
  id: text("id").primaryKey(),
  complaintId: text("complaintId")
    .notNull()
    .references(() => complaints.id, { onDelete: "cascade" }),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const notices = sqliteTable("notices", {
  id: text("id").primaryKey(),
  hostelId: text("hostelId"),
  authorId: text("authorId")
    .notNull()
    .references(() => user.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const slaPolicies = sqliteTable("sla_policies", {
  id: text("id").primaryKey(),
  respondHours: integer("respondHours").notNull(),
  resolveHours: integer("resolveHours").notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const counters = sqliteTable("counters", {
  id: text("id").primaryKey(),
  value: integer("value").notNull().default(0),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const seedSlaDefaults = [
  { id: "electrical", respondHours: 12, resolveHours: 48 },
  { id: "furniture", respondHours: 24, resolveHours: 72 },
  { id: "plumbing", respondHours: 12, resolveHours: 48 },
  { id: "civil", respondHours: 24, resolveHours: 120 },
  { id: "cleaning", respondHours: 12, resolveHours: 36 },
  { id: "water", respondHours: 6, resolveHours: 24 },
  { id: "washroom", respondHours: 12, resolveHours: 48 },
  { id: "mess", respondHours: 24, resolveHours: 72 },
  { id: "wifi_common", respondHours: 24, resolveHours: 72 },
  { id: "safety", respondHours: 6, resolveHours: 24 },
  { id: "other", respondHours: 24, resolveHours: 72 },
];
