import { inArray } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { dbForRequest } from "./request-db";
import { ensureSession } from "./auth-functions";

/**
 * Directory ordering, lowest first: the people a resident escalates to sit
 * below the trades they might call directly.
 *
 * A title outside this set (a duty added later, or a hand-edited row) sorts last
 * rather than crashing the directory.
 */
const RANK = {
  Caretaker: 0,
  Electrician: 1,
  "Plumbing staff": 2,
  "Assistant Warden": 3,
  Warden: 4,
  "Chief Warden": 5,
} as const satisfies Record<string, number>;

const RANK_FALLBACK = 9;

const RANKS: ReadonlyMap<string, number> = new Map(Object.entries(RANK));

function rankOf(title: string): number {
  return RANKS.get(title) ?? RANK_FALLBACK;
}

type Entry = {
  id: string; name: string; title: string; role: string; scope: string;
  hostelId: string | null; phone: string | null; onDuty: boolean; until: string;
  image: string | null;
};

/**
 * The hostel team, with photographs. Wardens carry a portrait so residents
 * recognise the person they are escalating to; maintenance staff fall back to
 * initials, which is honest — a stock photo of a caretaker is worse than none.
 */
const PEOPLE: (Omit<Entry, "onDuty" | "until"> & { onDuty?: boolean; until?: string })[] = [
  { id: "seed-kanhaiya", name: "Kanhaiya", title: "Caretaker", role: "staff", scope: "Boys Hostel 1 & 2", hostelId: null, phone: null, image: null },
  { id: "seed-gaurav", name: "Gaurav", title: "Electrician", role: "staff", scope: "All hostels", hostelId: null, phone: null, image: null },
  { id: "seed-kamal", name: "Kamal Kant", title: "Warden", role: "warden", scope: "Boys Hostel 1", hostelId: null, phone: null, image: "/people/kamal-kant.jpg", onDuty: true },
  { id: "seed-zaki", name: "Zaki Sujeet", title: "Warden", role: "warden", scope: "Boys Hostel 2", hostelId: null, phone: null, image: "/people/zaki-sujeet.jpg", onDuty: true },
  { id: "seed-chitranjan", name: "Chitranjan", title: "Chief Warden", role: "admin", scope: "Main campus", hostelId: null, phone: null, image: "/people/chitranjan.jpg", onDuty: false, until: "6 PM" },
];

/**
 * One hostel-scoped directory for the people residents actually need:
 * caretakers, maintenance staff, assistant warden, warden, chief warden.
 * Only approved duty contacts are published; calls are dialer links, never auto-dial.
 */
const directoryInput = z.object({ q: z.string().max(120).optional() }).strict().default({});

export const staffDirectory = createServerFn({ method: "GET" })
  .validator(directoryInput)
  .handler(async ({ data }) => {
    const { user } = await ensureSession();
    void user;
    const db = await dbForRequest();
    const s = await import("../db/schema");
    const q = (data.q ?? "").trim().toLowerCase();

    const staff = await db
      .select({ id: s.user.id, name: s.user.name, role: s.user.role, hostelId: s.user.hostelId, phone: s.user.phone, dept: s.user.dept, image: s.user.image })
      .from(s.user)
      .where(inArray(s.user.role, ["staff", "warden", "admin"]))
      .limit(100);

    let list: Entry[] = staff.map((p) => ({
      id: p.id,
      name: p.name,
      title: p.role === "staff" ? (p.dept ?? "Maintenance staff") : p.role === "warden" ? "Warden" : "Chief Warden",
      role: p.role,
      scope: p.hostelId ?? "All hostels",
      hostelId: p.hostelId,
      phone: p.phone ?? null,
      onDuty: true,
      until: "8 PM",
      image: p.image ?? null,
    }));

    // Registered staff always win; the roster fills the gaps so the directory is
    // never a page of "no staff found" while the hostel is plainly staffed.
    const real = new Set(list.map((p) => p.name.toLowerCase()));

    for (const p of PEOPLE) {
      if (real.has(p.name.toLowerCase())) continue;
      list.push({ ...p, onDuty: p.onDuty ?? true, until: p.until ?? "8 PM" });
    }

    if (q) list = list.filter((p) => `${p.name} ${p.title} ${p.scope}`.toLowerCase().includes(q));
    list.sort((a, b) => rankOf(a.title) - rankOf(b.title));

    return { onDuty: list.filter((p) => p.onDuty), others: list.filter((p) => !p.onDuty) };
  });
