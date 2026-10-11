import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth-tables";

export type ComplaintStatus =
  | "submitted"
  | "acknowledged"
  | "in_progress"
  | "resolved"
  | "closed"
  | "rejected"
  | "reopened";

export const hostels = sqliteTable("hostels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("boys"),
  floors: integer("floors").notNull().default(3),
  wardenId: text("wardenId"),
  caretakerName: text("caretakerName"),
  caretakerPhone: text("caretakerPhone"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  hostelId: text("hostelId")
    .notNull()
    .references(() => hostels.id),
  floor: integer("floor").notNull(),
  roomNo: text("roomNo").notNull(),
  capacity: integer("capacity").notNull().default(3),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const complaints = sqliteTable("complaints", {
  id: text("id").primaryKey(),
  seq: integer("seq").notNull(),
  studentId: text("studentId")
    .notNull()
    .references(() => user.id),
  hostelId: text("hostelId")
    .notNull()
    .references(() => hostels.id),
  roomId: text("roomId").references(() => rooms.id),
  floor: integer("floor"),
  roomLabel: text("roomLabel"),
  category: text("category").notNull(),
  subType: text("subType"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("submitted"),
  confidential: integer("confidential", { mode: "boolean" })
    .notNull()
    .default(false),
  assigneeId: text("assigneeId").references(() => user.id),
  slaDueAt: integer("slaDueAt", { mode: "timestamp_ms" }),
  overdue: integer("overdue", { mode: "boolean" }).notNull().default(false),
  resolvedAt: integer("resolvedAt", { mode: "timestamp_ms" }),
  closedAt: integer("closedAt", { mode: "timestamp_ms" }),
  rating: integer("rating"),
  ratingNote: text("ratingNote"),
  duplicateOfId: text("duplicateOfId"),
  upvotes: integer("upvotes").notNull().default(0),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const complaintPhotos = sqliteTable("complaint_photos", {
  id: text("id").primaryKey(),
  complaintId: text("complaintId")
    .notNull()
    .references(() => complaints.id, { onDelete: "cascade" }),
  r2Key: text("r2Key").notNull(),
  kind: text("kind").notNull().default("before"),
  mimeType: text("mimeType"),
  sizeBytes: integer("sizeBytes"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
});
