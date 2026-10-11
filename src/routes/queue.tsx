import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { getSession } from "../lib/auth-functions";
import { hostelBoard } from "../lib/board-functions";
import { claimComplaint, handoffComplaint, markBlocked } from "../lib/shift-actions";
import { transitionComplaint } from "../lib/complaint-actions";
import { AppShell } from "../components/AppShell";
import { Empty, Segmented, statusChip } from "../components/bulletin-ui";
import { tapFeedback, useToast } from "../components/motion";
import { catStyle, daysCount, dueLabel, hostelName } from "../utils/bulletin";

export const Route = createFileRoute("/queue")({
  beforeLoad: async () => {
    const s = await getSession();

    if (!s) throw redirect({ to: "/login" });

    if (!["staff", "warden", "admin"].includes(s.user.role)) throw redirect({ to: "/bulletin" });

    return { me: s.user };
  },
  loader: async ({ context }) => {
    // `beforeLoad` put the whole SessionUser on the context, so it is read from
    // the inferred type rather than re-declared here.
    const board = await hostelBoard({ data: { hostelId: context.me.hostelId ?? undefined } });

    return { ...board, meId: context.me.id };
  },
  component: Slate,
});

type RowItem = {
  id: string; title: string; category: string; roomLabel?: string | null; hostelId: string;
  createdAt: number; status: string; assigneeName?: string | null; assigneeId?: string | null;
  overdue?: boolean; slaDueAt?: number | null;
};

function Row({ c, mine, carry }: { c: RowItem; mine: boolean; carry?: boolean }) {
  const s = catStyle(c.category);
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"" | "accept" | "hand" | "done">("");
  const days = daysCount(c.createdAt);

  /** Runs a shift action, then reports the outcome as a toast. */
  async function act<TResult>(kind: "accept" | "hand" | "done", fn: () => Promise<TResult>, ok: string, detail?: string) {
    setBusy(kind);

    try {
      await fn();
      toast.push({ title: ok, detail });
      await router.invalidate();
    } catch (e) {
      toast.push({
        title: "Could not save",
        detail: e instanceof Error ? e.message : undefined,
        tone: "warn",
      });
    } finally {
      setBusy("");
    }
  }

  async function accept() {
    await act("accept", () => claimComplaint({ data: { id: c.id } }), "Job accepted", "It is in your name — open it to post the first update.");
  }

  return (
    <div className="row-hover rounded-[18px] bg-white px-3 py-3 ring-1 ring-slate-900/[0.06]">
      <Link to="/complaints/$id" params={{ id: c.id }} className="row-press -mx-1 flex items-center gap-3 rounded-xl px-1">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${s.bg} ${s.fg}`}>{s.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-extrabold leading-tight">{c.title}</span>
          <span className="mt-0.5 block truncate text-[11.5px] text-slate-500">
            {c.roomLabel ? `${c.roomLabel} · ` : ""}{hostelName(c.hostelId)} · {days} day{days > 1 ? "s" : ""}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-slate-400">
            {c.assigneeName ? `${c.assigneeName} holds it now` : "Unassigned — triage needed"}
          </span>
          {(carry || c.overdue) && (
            <span className="mt-1 inline-block rounded-full bg-[#fde2e2] px-2 py-[2px] text-[10px] font-extrabold text-[#b3261e]">
              {c.overdue ? `Overdue · ${dueLabel(c.slaDueAt, true)}` : `Carried over · ${days} days old`}
            </span>
          )}
        </span>
        {statusChip(c.status, c.overdue)}
        <ChevronRight size={16} className="shrink-0 text-slate-300" />
      </Link>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {mine ? (
          <button
            disabled={busy !== ""}
            onPointerDown={() => tapFeedback(12)}
            onClick={() => act("done", () => transitionComplaint({ data: { id: c.id, to: "resolved", remark: "Work completed" } }), "Marked as done", "The resident is asked to confirm.")}
            className="pressable rounded-xl bg-[#0f4c3a] py-2.5 text-[12px] font-extrabold text-white disabled:opacity-50"
          >
            {busy === "done" ? "Saving…" : "Mark done"}
          </button>
        ) : (
          <button
            disabled={busy !== ""}
            onPointerDown={() => tapFeedback(12)}
            onClick={accept}
            className="pressable rounded-xl bg-[#0f4c3a] py-2.5 text-[12px] font-extrabold text-white disabled:opacity-50"
          >
            {busy === "accept" ? "Accepting…" : "Accept"}
          </button>
        )}
        <button
          disabled={busy !== ""}
          onPointerDown={() => tapFeedback(8)}
          onClick={() =>
            act(
              "hand",
              () => handoffComplaint({ data: { id: c.id, reason: mine ? "Shift change" : undefined } }),
              mine ? "Handed over" : "Passed on",
              "It is back in the unassigned queue with a reason on record.",
            )
          }
          className="pressable rounded-xl bg-white py-2.5 text-[12px] font-extrabold text-[#0f4c3a] ring-1 ring-[#0f4c3a]/30 disabled:opacity-50"
        >
          {busy === "hand" ? "Handing off…" : "Hand off"}
        </button>
      </div>
    </div>
  );
}


function BlockForm({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [reason, setReason] = useState("Waiting for part");
  const [until, setUntil] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-1 rounded-xl bg-[#fdf7e3] p-2 ring-1 ring-[#f0dfa8]">
      <p className="text-[11px] font-extrabold text-[#8a5a12]">The reason and promised date are public on this item&apos;s timeline.</p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="What is it waiting on?"
        className="mt-1.5 w-full rounded-lg bg-white px-2 py-1.5 text-[12px] outline-none ring-1 ring-slate-900/10"
      />
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="date"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          className="rounded-lg bg-white px-2 py-1.5 text-[12px] outline-none ring-1 ring-slate-900/10"
        />
        <button
          disabled={busy}
          onPointerDown={() => tapFeedback(12)}
          onClick={async () => {
            setBusy(true);

            try {
              await markBlocked({ data: { id, reason, until } });
              toast.push({ title: "Block recorded", detail: "The reason and date are public on the timeline." });
              await router.invalidate();
            } catch (e) {
              toast.push({
                title: "Could not save the block",
                detail: e instanceof Error ? e.message : undefined,
                tone: "warn",
              });
            } finally {
              setBusy(false);
            }
          }}
          className="pressable ml-auto rounded-lg bg-[#0f4c3a] px-3.5 py-2 text-[11.5px] font-extrabold text-white disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save block"}
        </button>
      </div>
    </div>
  );
}

function Slate() {
  const data = Route.useLoaderData();
  const [tab, setTab] = useState<"un" | "due" | "carry" | "mine">("un");

  const tabs = [
    { id: "un" as const, label: `Unassigned (${data.unassigned.length})` },
    { id: "due" as const, label: `Due today (${data.dueToday.length})` },
    { id: "carry" as const, label: `Carry-over (${data.carry.length})` },
    { id: "mine" as const, label: `My work (${data.mine.length})` },
  ];

  const shown = tab === "un" ? data.unassigned : tab === "due" ? data.dueToday : tab === "carry" ? data.carry : data.mine;
  const today = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  return (
    <AppShell role="staff">
      <h1 className="px-1 text-[26px] font-extrabold leading-tight text-[#0f2b23]">Shift Slate</h1>
      <p className="mt-0.5 px-1 text-[11.5px] text-slate-500">
        {today} · {hostelName(data.hostelId)} · hand over with a reason, never silently
      </p>

      <div className="mt-3">
        <Segmented items={tabs} value={tab} onChange={setTab} />
      </div>

      {/* Re-keyed on the tab so each slate replays its entrance. */}
      <div key={tab} className="stagger mt-3 space-y-2.5">
        {shown.length === 0 && (
          <Empty
            title={tab === "un" ? "Nothing unassigned" : tab === "due" ? "Nothing due today" : tab === "carry" ? "No carry-over work" : "No jobs in your name"}
            hint={tab === "un" ? "Every open item in this hostel already has a named owner." : tab === "mine" ? "Accept a job from Unassigned and it lands here." : undefined}
          />
        )}
        {shown.map((c) => {
          const mine = c.assigneeId === data.meId;

          return (
            <div key={c.id}>
              <Row c={c} mine={mine} carry={tab === "carry"} />
              {mine && !c.blocked && (
                <details className="group mt-1">
                  <summary className="pressable flex cursor-pointer list-none items-center gap-1 rounded-lg px-1 py-1.5 text-[11.5px] font-bold text-[#8a5a12]">
                    Waiting on a part or decision?
                  </summary>
                  <BlockForm id={c.id} />
                </details>
              )}
              {c.blocked && c.lastRemark && (
                <p className="pop-in px-1 pt-1 text-[11px] font-semibold text-[#8a5a12]">{c.lastRemark}</p>
              )}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
