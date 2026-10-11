import type { ComplaintPriority, ComplaintStatus } from "#/lib/complaint-policy";

export const CATEGORIES = [
  { id: "electrical", en: "Electrical", hi: "बिजली", icon: "zap", items: ["Ceiling fan", "Tube light / bulb", "Switch / socket", "MCB tripping", "Cooler wiring"] },
  { id: "furniture", en: "Furniture", hi: "फर्नीचर", icon: "armchair", items: ["Chair", "Table", "Bed / cot", "Door / lock", "Window / grill", "Cupboard"] },
  { id: "plumbing", en: "Plumbing", hi: "पानी-नल", icon: "droplets", items: ["Tap leak", "Flush tank", "Pipe leak", "Drain block"] },
  { id: "civil", en: "Civil / Wall", hi: "दीवार", icon: "brick-wall", items: ["Plaster crack", "Seepage", "Floor tile", "Roof leak"] },
  { id: "cleaning", en: "Cleaning", hi: "सफाई", icon: "sparkles", items: ["Room corridor", "Garbage", "Dustbins", "Common area"] },
  { id: "water", en: "Drinking water", hi: "पीने का पानी", icon: "glass-water", items: ["Water cooler", "RO / filter", "No water supply"] },
  { id: "washroom", en: "Washroom", hi: "शौचालय", icon: "bath", items: ["Toilet block", "Bathroom", "Wash basin", "Exhaust fan"] },
  { id: "mess", en: "Mess / Food", hi: "मेस", icon: "utensils", items: ["Food quality", "Hygiene", "Timing", "Dining hall"] },
  { id: "wifi_common", en: "WiFi / Common", hi: "वाई-फाई", icon: "wifi", items: ["WiFi down", "Reading room", "Games room", "Badminton court"] },
  { id: "safety", en: "Safety", hi: "सुरक्षा", icon: "shield", items: ["Fire extinguisher", "Stray entry", "Stray dogs", "Street light", "Ragging (confidential)"] },
  { id: "other", en: "Other", hi: "अन्य", icon: "dots", items: ["Other"] },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

const CATEGORY_ID_SET: ReadonlySet<string> = new Set(CATEGORIES.map((c) => c.id));

/**
 * Narrows a category read from storage. The column is a plain text column, so
 * the value only becomes a `CategoryId` once it has been checked against the
 * catalogue — which is what lets display code index `CAT_STYLE` safely.
 */
export function isCategoryId(value: string): value is CategoryId {
  return CATEGORY_ID_SET.has(value);
}

/**
 * Bilingual display metadata, keyed by the closed status and priority sets in
 * ./complaint-policy.
 *
 * `satisfies` rather than a `Record<string, …>` annotation: the annotation
 * would promise that any string is a valid key while the lookup below has to
 * fall back for unknown ones. This keeps the key set honest and gives every
 * lookup a compile-time-exhaustive answer.
 */
export const STATUS_META = {
  submitted: { en: "Submitted", hi: "जमा", color: "#2563eb" },
  acknowledged: { en: "Seen by warden", hi: "देखा गया", color: "#7c3aed" },
  in_progress: { en: "Work in progress", hi: "काम जारी", color: "#d97706" },
  resolved: { en: "Resolved — verify", hi: "ठीक — पुष्टि करें", color: "#059669" },
  closed: { en: "Closed", hi: "बंद", color: "#16a34a" },
  rejected: { en: "Rejected", hi: "खारिज", color: "#dc2626" },
  reopened: { en: "Reopened", hi: "पुनः खोला", color: "#ea580c" },
} as const satisfies Record<ComplaintStatus, { en: string; hi: string; color: string }>;

export const PRIORITY_META = {
  low: { en: "Low", color: "#64748b" },
  medium: { en: "Medium", color: "#2563eb" },
  high: { en: "High", color: "#d97706" },
  urgent: { en: "Urgent", color: "#dc2626" },
} as const satisfies Record<ComplaintPriority, { en: string; color: string }>;

/**
 * The three buildings, in one place.
 *
 * The ids are foreign keys on `hostels`, referenced by complaints, rooms and
 * user profiles, and are also what `ensureReferenceData` seeds. They are
 * duplicated as literals in four UI modules and in the seed, so a fourth
 * building added here would be invisible to every other module unless this
 * became the single definition.
 */
export const HOSTELS = [
  { id: "BH1", name: "Boys Hostel 1", kind: "boys", floors: 4 },
  { id: "BH2", name: "Boys Hostel 2", kind: "boys", floors: 4 },
  { id: "GH1", name: "Girls Hostel 1", kind: "girls", floors: 4 },
] as const;

export type HostelId = (typeof HOSTELS)[number]["id"];

/** `[id, label]` pairs for the `<option>` lists in the forms. */
export const HOSTEL_OPTIONS: readonly (readonly [HostelId, string])[] = HOSTELS.map(
  (h) => [h.id, h.name] as const,
);

export function hostelName(id?: string | null): string {
  return HOSTELS.find((h) => h.id === id)?.name ?? "Hostel";
}

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.en ?? id;
}
