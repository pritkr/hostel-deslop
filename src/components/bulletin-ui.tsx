import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, Megaphone, Plus } from "lucide-react";
import { ageLabel, catStyle, dueLabel, hostelName, ownerLabel } from "../utils/bulletin";
import { Skeleton, RowSkeleton, tapFeedback } from "./motion";
import { cn } from "../utils/format";

export type BoardItem = {
  id: string; title: string; description?: string; category: string;
  subType?: string | null; status: string; hostelId: string;
  roomLabel?: string | null; upvotes?: number; overdue?: boolean;
  createdAt: number; updatedAt?: number;
  assigneeName?: string | null; assigneeRole?: string | null;
  slaDueAt?: number | null;
};

/** Status chip in the mockup's restrained palette (amber = waiting, green = done, red = broken). */
export function statusChip(status: string, overdue?: boolean) {
  const base = "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-[3px] text-[10.5px] font-extrabold";

  if (overdue) return <span className={`${base} bg-[#fde2e2] text-[#b3261e]`}>Overdue</span>;

  if (status === "submitted") return <span className={`${base} bg-[#fbe3ae] text-[#8a5a12]`}>Open</span>;

  if (status === "acknowledged") return <span className={`${base} bg-[#e8f0fd] text-[#1d4ed8]`}>Assigned</span>;

  if (status === "in_progress") return <span className={`${base} bg-[#e6f4ec] text-[#0f4c3a]`}>In progress</span>;

  if (status === "reopened") return <span className={`${base} bg-[#fde2e2] text-[#b3261e]`}>Still broken</span>;

  if (status === "resolved") return <span className={`${base} bg-[#e6f4ec] text-[#0f4c3a]`}><Check size={11} /> Fixed</span>;

  if (status === "closed") return <span className={`${base} bg-[#e6f4ec] text-[#0f4c3a]`}><Check size={11} /> Confirmed</span>;

  if (status === "rejected") return <span className={`${base} bg-slate-200 text-slate-600`}>Out of scope</span>;

  return <span className={`${base} bg-slate-100 text-slate-600`}>{status}</span>;
}

/** One public-notice style row: category mark, what/where/age, current owner, status chip. */
export function BulletinRow({ c, sub }: { c: BoardItem; sub?: string }) {
  const s = catStyle(c.category);
  const openish = c.status !== "closed" && c.status !== "resolved";

  return (
    <Link
      to="/complaints/$id"
      params={{ id: c.id }}
      onPointerDown={() => tapFeedback(6)}
      className="row-press row-hover flex items-center gap-3 rounded-[18px] bg-white px-3 py-3 ring-1 ring-slate-900/[0.06]"
    >
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${s.bg} ${s.fg}`}>{s.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-extrabold leading-tight text-slate-900">{c.title}</span>
        <span className="mt-0.5 block truncate text-[11.5px] text-slate-500">
          {sub ?? `${c.roomLabel ? c.roomLabel : hostelName(c.hostelId)} · ${ageLabel(c.createdAt)}`}
        </span>
        {openish && (
          <span className="mt-1 block truncate text-[11px] text-slate-400">
            {ownerLabel(c)} · {dueLabel(c.slaDueAt, c.overdue)}
          </span>
        )}
      </span>
      {statusChip(c.status, c.overdue)}
      <ChevronRight size={16} className="shrink-0 text-slate-300" />
    </Link>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="pop-in rounded-[18px] bg-white px-4 py-8 text-center ring-1 ring-slate-900/[0.06]">
      <p className="text-[14px] font-extrabold text-slate-700">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-[17rem] text-[12px] leading-relaxed text-slate-500">{hint}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * Segmented control with a thumb that physically travels between segments.
 * The measurement happens on layout, so the thumb lands on the real width of
 * the chosen label rather than an even split — long labels stay readable.
 */
export function Segmented<T extends string>({
  items, value, onChange,
}: { items: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ x: 0, w: 0 });

  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLElement>(`[data-seg="${value}"]`);

    if (!el || !wrap.current) return;
    // offsetLeft is measured from the container's padding edge, which is the
    // same origin an absolutely-positioned `left: 0` uses — no fudge factor.
    setBox({ x: el.offsetLeft, w: el.offsetWidth });
  }, [value, items]);

  return (
    <div
      ref={wrap}
      className="relative grid gap-1 rounded-2xl bg-white p-1 ring-1 ring-slate-900/[0.06]"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      role="tablist"
    >
      <span
        aria-hidden
        className="seg-thumb pointer-events-none absolute bottom-1 top-1 rounded-xl bg-[#e3edfb]"
        style={{ left: 0, width: box.w, transform: `translate3d(${box.x}px,0,0)` }}
      />
      {items.map((it) => {
        const on = value === it.id;

        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={on}
            data-seg={it.id}
            onClick={() => {
              if (!on) tapFeedback(5);
              onChange(it.id);
            }}
            className={cn(
              "seg-label relative truncate rounded-xl px-2 py-2 text-[12px]",
              on ? "font-extrabold text-[#1d3a63]" : "font-bold text-slate-400",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/** Blue "Incident Notice" card from the bulletin mockup. */
export function IncidentNotice({ n, when }: { n: { title: string; body: string; pinned?: boolean | null }; when?: string }) {
  return (
    <div className="overflow-hidden rounded-[18px] bg-[#e8f0fd] ring-1 ring-[#cfe0fb]">
      <div className="flex gap-3 px-3 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#d3e3fb] text-[#1d4ed8]">
          <Megaphone size={17} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-extrabold text-[#16325c]">{n.pinned ? "Pinned notice" : n.title}</p>
          <p className="mt-0.5 line-clamp-4 text-[11.5px] leading-relaxed text-[#33456b]">{n.body}</p>
        </div>
      </div>
      <p className="border-t border-[#cfe0fb] bg-[#dbe8fc] px-3 py-2 text-[11px] font-semibold text-[#33456b]">
        {n.title}{when ? ` · ${when}` : ""}
      </p>
    </div>
  );
}

/** Full-width primary action, bottom of the bulletin feed. */
export function ReportFaultButton() {
  return (
    <Link
      to="/complaints/new"
      search={{ category: "" }}
      onPointerDown={() => tapFeedback(8)}
      className="pressable flex items-center justify-center gap-2 rounded-[18px] bg-[#0f4c3a] py-3.5 text-[14px] font-extrabold text-white shadow-[0_10px_24px_-16px_rgba(15,76,58,0.9)]"
    >
      <span className="grid h-6 w-6 place-items-center rounded-full bg-white/15">
        <Plus size={15} strokeWidth={3} />
      </span>
      Report a fault
    </Link>
  );
}

/** Section label with place pin ("📍 Boys Hostel 1"). */
export function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1 py-1">
      <p className="text-[12.5px] font-extrabold text-slate-700">{children}</p>
      <span className="ml-auto">{action}</span>
    </div>
  );
}

/** A loading block shaped like the list it stands in for. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return <RowSkeleton rows={rows} />;
}

export { Skeleton };
