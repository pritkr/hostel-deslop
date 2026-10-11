import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight, MapPin } from "lucide-react";
import { getSession } from "../lib/auth-functions";
import { hostelBoard } from "../lib/board-functions";
import { listNotices } from "../lib/notice-functions";
import { AppShell } from "../components/AppShell";
import { BulletinRow, Empty, IncidentNotice, ReportFaultButton, Segmented } from "../components/bulletin-ui";
import { tapFeedback } from "../components/motion";
import { ageLabel, hostelName } from "../utils/bulletin";
import { HOSTEL_OPTIONS } from "../utils/catalog";
import { isStaffRole } from "../lib/auth-fields";

export const Route = createFileRoute("/bulletin")({
  beforeLoad: async () => {
    const s = await getSession();

    if (!s) throw redirect({ to: "/login" });

    return { me: s.user };
  },
  loader: async ({ context }) => {
    const [board, notices] = await Promise.all([
      hostelBoard({ data: { hostelId: context.me.hostelId ?? undefined } }),
      listNotices({ data: {} }),
    ]);

    return { me: context.me, board, notices };
  },
  component: Bulletin,
});

function Bulletin() {
  const { me, board, notices } = Route.useLoaderData();
  // Campus-wide roles get the hostel switcher; a resident or a warden does not.
  const canSwitch = isStaffRole(me.role) && me.role !== "warden";
  const [tab, setTab] = useState<"open" | "done">("open");
  const [scope, setScope] = useState(board);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);

  async function switchTo(hostelId: string) {
    setBusy(true);
    setPick(false);

    try {
      setScope(await hostelBoard({ data: { hostelId } }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <h1 className="px-1 text-[26px] font-extrabold leading-tight text-[#0f2b23]">Repair Bulletin</h1>
      <p className="mt-0.5 px-1 text-[11.5px] text-slate-500">
        Every unresolved request in {hostelName(scope.hostelId)} · visible to all residents
      </p>

      <div className="mt-3">
        <Segmented
          items={[
            { id: "open" as const, label: `All unresolved (${scope.unresolved.length})` },
            { id: "done" as const, label: "Recently repaired" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      <div className="mt-3 space-y-2.5">
        <button
          onPointerDown={() => canSwitch && tapFeedback(6)}
          onClick={() => canSwitch && setPick((v) => !v)}
          className="pressable-sm flex w-full items-center gap-1.5 rounded-lg px-1 py-1 text-left"
        >
          <MapPin size={14} className="text-[#0f4c3a]" />
          <span className="text-[12.5px] font-extrabold text-slate-700">{hostelName(scope.hostelId)}</span>
          {canSwitch && <ChevronRight size={14} className="text-slate-400" />}
          {busy && <span className="text-[11px] text-slate-400">updating…</span>}
        </button>
        {pick && (
          <div className="no-scrollbar fade-in flex gap-2 overflow-x-auto px-1">
            {HOSTEL_OPTIONS.map(([id, label]) => (
              <button
                key={id}
                onClick={() => switchTo(id)}
                className={
                  scope.hostelId === id
                    ? "pressable shrink-0 rounded-full bg-[#0f4c3a] px-3.5 py-1.5 text-[11.5px] font-extrabold text-white"
                    : "pressable shrink-0 rounded-full bg-white px-3.5 py-1.5 text-[11.5px] font-bold text-slate-500 ring-1 ring-slate-900/10"
                }
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Re-keyed on the tab and the scope so the feed replays its entrance. */}
        <div key={`${tab}-${scope.hostelId}`} className="stagger mt-0 space-y-2.5">
          {tab === "open" ? (
            <>
              {scope.unresolved.length === 0 && (
                <Empty
                  title={`All clear in ${hostelName(scope.hostelId)}`}
                  hint="No unresolved repair requests right now. Confirmed repairs stay in Recently repaired."
                />
              )}
              {scope.unresolved.slice(0, 2).map((c) => <BulletinRow key={c.id} c={c} />)}
              {notices[0] && <IncidentNotice n={notices[0]} when={ageLabel(new Date(notices[0].createdAt).getTime())} />}
              {scope.unresolved.slice(2).map((c) => <BulletinRow key={c.id} c={c} />)}
            </>
          ) : (
            <>
              {scope.repaired.length === 0 && (
                <Empty title="No confirmed repairs yet" hint="Work that staff mark fixed and residents confirm appears here with its full story." />
              )}
              {scope.repaired.map((c) => <BulletinRow key={c.id} c={c} />)}
            </>
          )}
        </div>

        <div className="pt-1">
          <ReportFaultButton />
        </div>
      </div>
    </AppShell>
  );
}
