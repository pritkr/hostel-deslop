import {
  Armchair, Bath, BrickWall, Droplets, GlassWater, PlusCircle, ShieldCheck, Sparkles, UtensilsCrossed, Wifi, Zap,
} from "lucide-react";
import { hostelName, isCategoryId, type CategoryId } from "./catalog";

export { hostelName };

/**
 * Category marks — same soft-tint circles as the mockup.
 *
 * Keyed by the same closed category set as `CATEGORIES`, so adding a category
 * there without adding its mark is a compile error rather than a silent fallback
 * to the "other" tint.
 */
export const CAT_STYLE = {
  electrical: { bg: "bg-[#fdecec]", fg: "text-[#c2410c]", icon: <Zap size={20} /> },
  plumbing: { bg: "bg-[#e7f1fd]", fg: "text-[#1d4ed8]", icon: <Droplets size={20} /> },
  furniture: { bg: "bg-[#fdf0e3]", fg: "text-[#c2740c]", icon: <Armchair size={20} /> },
  cleaning: { bg: "bg-[#e6f4ec]", fg: "text-[#0f4c3a]", icon: <Sparkles size={20} /> },
  water: { bg: "bg-[#e7f1fd]", fg: "text-[#0e7490]", icon: <GlassWater size={20} /> },
  washroom: { bg: "bg-[#eef1f5]", fg: "text-[#475569]", icon: <Bath size={20} /> },
  mess: { bg: "bg-[#fdf0e3]", fg: "text-[#a16207]", icon: <UtensilsCrossed size={20} /> },
  wifi_common: { bg: "bg-[#fdf7e3]", fg: "text-[#a16207]", icon: <Wifi size={20} /> },
  civil: { bg: "bg-[#fdf0e3]", fg: "text-[#b45309]", icon: <BrickWall size={20} /> },
  safety: { bg: "bg-[#fdecec]", fg: "text-[#b3261e]", icon: <ShieldCheck size={20} /> },
  other: { bg: "bg-[#eef1f5]", fg: "text-[#475569]", icon: <PlusCircle size={20} /> },
} as const satisfies Record<CategoryId, { bg: string; fg: string; icon: React.ReactNode }>;

export function catStyle(cat: string) {
  return isCategoryId(cat) ? CAT_STYLE[cat] : CAT_STYLE.other;
}

/** Short relative age for "Hostel · 2 days" style subtitles. */
export function ageLabel(ms: number) {
  const d = Math.max(0, Date.now() - ms);
  const mins = Math.floor(d / 60000);

  if (mins < 2) return "just now";

  if (mins < 60) return `${mins} mins`;
  const h = Math.floor(mins / 60);

  if (h < 24) return `${h} hour${h > 1 ? "s" : ""}`;
  const days = Math.floor(h / 24);

  return `${days} day${days > 1 ? "s" : ""}`;
}

export function daysCount(ms: number) {
  return Math.max(1, Math.round((Date.now() - ms) / 86400000));
}

/**
 * Who holds the next action, in resident-readable words.
 *
 * An unassigned item still needs an owner on screen, so the category decides the
 * trade that would handle it. Categories outside the set (or the two with no
 * dedicated trade) fall back to the caretaker.
 */
const OWNER_BY_CATEGORY = {
  electrical: "Electrician",
  plumbing: "Plumbing staff",
  water: "Water staff",
  washroom: "Plumbing staff",
  furniture: "Carpentry",
  cleaning: "Cleaning staff",
  mess: "Mess staff",
  civil: "Civil staff",
  safety: "Caretaker",
} as const satisfies Partial<Record<CategoryId, string>>;

/** The categories that name a dedicated trade rather than the caretaker. */
type CategoryWithTrade = keyof typeof OWNER_BY_CATEGORY;

function isCategoryWithTrade(category: CategoryId): category is CategoryWithTrade {
  return category in OWNER_BY_CATEGORY;
}

export function ownerLabel(c: { assigneeName?: string | null; assigneeRole?: string | null; category: string }) {
  if (c.assigneeName) return c.assigneeName;

  if (isCategoryId(c.category) && isCategoryWithTrade(c.category)) {
    return OWNER_BY_CATEGORY[c.category];
  }

  return "Caretaker";
}

/** "Next update due" line — never lets an item look fresh when it is not. */
export function dueLabel(slaDueAt?: number | null, overdue?: boolean) {
  if (overdue) return "past promised date";

  if (!slaDueAt) return "awaiting triage";
  const left = slaDueAt - Date.now();

  if (left <= 0) return "update overdue";
  const h = Math.floor(left / 3600000);

  if (h < 1) return "update due within the hour";

  if (h < 24) return `update due in ${h}h`;
  const d = Math.round(h / 24);

  return `update due in ${d} day${d > 1 ? "s" : ""}`;
}

export const AVATAR_TONES = [
  "bg-[#e6f4ec] text-[#0f4c3a]",
  "bg-[#e7f1fd] text-[#1d4ed8]",
  "bg-[#f3e8fd] text-[#7e22ce]",
  "bg-[#fdf0e3] text-[#c2740c]",
  "bg-[#eef1f5] text-[#475569]",
];

export function initials(name: string) {
  return name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}
