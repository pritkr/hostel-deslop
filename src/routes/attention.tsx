import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { getSession } from "../lib/auth-functions";
import { hostelBoard } from "../lib/board-functions";
import { escalateComplaint } from "../lib/shift-actions";
import { AppShell } from "../components/AppShell";
import { Empty, Segmented, statusChip } from "../components/bulletin-ui";
import { tapFeedback, useToast } from "../components/motion";
import { ageLabel, catStyle, daysCount, hostelName } from "../utils/bulletin";

export const Route = createFileRoute("/attention")({
  beforeLoad: async () => {
    const s = await getSession();

    if (!s) throw redirect({ to: "/login" });

    if (!["warden", "admin"].includes(s.user.role)) throw redirect({ to: "/queue" });

    return { me: s.user };
  },
  loader: async ({ context }) =>
    hostelBoard({ data: { hostelId: context.me.hostelId ?? undefined } }),
  component: Attention,
});

type Item = {
  id: string; title: string; category: string; roomLabel?: string | null; hostelId: string;
  createdAt: number; updatedAt: number; lastEventAt?: number | null; lastRemark?: string | null;
  assigneeName?: string | null; overdue?: boolean;
};

function NeedRow({ c, tag, onEscalate }: { c: Item; tag: string; onEscalate: (id: string, tag: string) => Promise<void> }) {
  const s = catStyle(c.category);
  const days = daysCount(c.createdAt);
  const since = ageLabel(c.lastEventAt ?? c.updatedAt);
  const [busy, setBusy] = useState(false);

  return (
    <div className="row-hover rounded-[18px] bg-white px-3 py-3 ring-1 ring-slate-900/[0.06]">
      <Link to="/complaints/$id" params={{ id: c.id }} className="row-press -mx-1 flex items-center gap-3 rounded-xl px-1">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${s.bg} ${s.fg}`}>{s.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-extrabold leading-tight">{c.title}</span>
          <span className="mt-0.5 block truncate text-[11.5px] text-slate-500">
            {c.roomLabel ? `${c.roomLabel} · ` : ""}{hostelName(c.hostelId)} · {days} day{days > 1 ? "s" : ""}
          </span>
          <span className="mt-1 flex items-center gap-2">
            <span className="rounded-full bg-[#fde2e2] px-2 py-[2px] text-[10px] font-extrabold text-[#b3261e]">{tag}</span>
            <span className="truncate text-[11px] text-slate-400">
              {c.assigneeName ? `${c.assigneeName} · ` : "Unassigned · "}no update since {since}
            </span>
          </span>
        </span>
        {statusChip(c.overdue ? "submitted" : "acknowledged", c.overdue)}
        <ChevronRight size={16} className="shrink-0 text-slate-300" />
      </Link>
      <button
        disabled={busy}
        onPointerDown={() => tapFeedback(12)}
        onClick={async () => {
          setBusy(true);

          try {
            await onEscalate(c.id, tag);
          } finally {
            setBusy(false);
          }
        }}
        className="pressable mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#f2c14e] py-2.5 text-[12.5px] font-extrabold text-[#4a3208] disabled:opacity-60"
      >
        <AlertTriangle size={14} /> {busy ? "Escalating…" : "Escalate to chief warden"}
      </button>
    </div>
  );
}


function Attention() {
  const b = Route.useLoaderData();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<"over" | "blocked" | "stale" | "disp">("over");

  async function escalate(id: string, tag: string) {
    try {
      await escalateComplaint({ data: { id, reason: tag } });
      toast.push({ title: "Escalated to chief warden", detail: "The reason is on the public timeline." });
      await router.invalidate();
    } catch (e) {
      toast.push({
        title: "Could not escalate",
        detail: e instanceof Error ? e.message : undefined,
        tone: "warn",
      });
    }
  }

  const tabs = [
    { id: "over" as const, label: `Overdue (${b.overdue.length})` },
    { id: "blocked" as const, label: `Blocked (${b.blocked.length})` },
    { id: "stale" as const, label: `Stale (${b.stalled.length})` },
    { id: "disp" as const, label: `Disputed (${b.disputed.length})` },
  ];

  const shown = tab === "over" ? b.overdue : tab === "blocked" ? b.blocked : tab === "stale" ? b.stalled : b.disputed;
  const tagFor = (t: typeof tab) => (t === "over" ? "Overdue" : t === "blocked" ? "Blocked" : t === "stale" ? "No update" : "Disputed");

  return (
    <AppShell role="warden">
      <h1 className="px-1 text-[26px] font-extrabold leading-tight text-[#0f2b23]">Needs Attention</h1>
      <p className="mt-0.5 px-1 text-[11.5px] text-slate-500">
        {hostelName(b.hostelId)} · what is falling through, scannable in a few minutes
      </p>

      <div className="mt-3">
        <Segmented items={tabs} value={tab} onChange={setTab} />
      </div>

      <div className="mt-3 rounded-[18px] bg-white px-3 py-2.5 ring-1 ring-slate-900/[0.06]">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Since your last check · 24h</p>
        {b.since.length === 0 ? (
          <p className="mt-1 text-[11.5px] text-slate-500">No assignments, closures or escalations recorded in the last day.</p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {b.since.slice(0, 4).map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-[11.5px] text-slate-600">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0f4c3a]" />
                <span className="min-w-0">
                  <span className="font-bold text-slate-700">{e.remark ?? (e.toStatus ? `Moved to ${e.toStatus}` : "Update")}</span>
                  {" — "}
                  <Link to="/complaints/$id" params={{ id: e.complaintId }} className="underline decoration-slate-300">
                    {e.title}
                  </Link>
                  {" · "}{ageLabel(e.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Re-keyed on the tab so each triage queue replays its entrance. */}
      <div key={tab} className="stagger mt-3 space-y-2.5">
        {shown.length === 0 && (
          <Empty
            title={tab === "over" ? "Nothing overdue" : tab === "blocked" ? "Nothing blocked" : tab === "stale" ? "Nothing stale" : "No disputed closures"}
            hint={tab === "stale" ? "Stale means no truthful update for three days or more." : tab === "over" ? "Every open item is still inside its promised window." : undefined}
          />
        )}
        {shown.map((c) => (
          <NeedRow key={c.id} c={c} tag={tagFor(tab)} onEscalate={escalate} />
        ))}
      </div>

      <p className="mt-3 px-1 text-center text-[11px] text-slate-400">
        Reporter identity stays private here · {b.unassigned.length} unassigned · {b.unresolved.length} open in total
      </p>
    </AppShell>
  );
}
