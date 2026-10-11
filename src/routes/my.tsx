import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { getSession } from "../lib/auth-functions";
import { listComplaints } from "../lib/complaint-list";
import { AppShell } from "../components/AppShell";
import { BulletinRow, Empty, Segmented } from "../components/bulletin-ui";
import { tapFeedback } from "../components/motion";
import { ageLabel } from "../utils/bulletin";

export const Route = createFileRoute("/my")({
  beforeLoad: async () => {
    const s = await getSession();

    if (!s) throw redirect({ to: "/login" });

    return { me: s.user };
  },
  loader: async () => listComplaints({ data: { scope: "mine", limit: 50 } }),
  component: MyReports,
});

function MyReports() {
  const items = Route.useLoaderData();
  const [tab, setTab] = useState<"open" | "done" | "declined">("open");
  const open = items.filter((c) => !["closed", "resolved", "rejected"].includes(c.status));
  // "Repaired" has to mean repaired. A rejected complaint was ruled out of
  // scope, so counting it as a success told the resident their fault got fixed
  // when in fact it was dismissed.
  const done = items.filter((c) => ["closed", "resolved"].includes(c.status));
  const declined = items.filter((c) => c.status === "rejected");
  const shown = tab === "open" ? open : tab === "done" ? done : declined;

  return (
    <AppShell>
      <h1 className="px-1 text-[26px] font-extrabold leading-tight text-[#0f2b23]">My reports</h1>
      <p className="mt-0.5 px-1 text-[11.5px] text-slate-500">
        Your own requests, with the full repair story on each one
      </p>

      <div className="mt-3">
        <Segmented
          items={[
            { id: "open" as const, label: `Open (${open.length})` },
            { id: "done" as const, label: `Repaired (${done.length})` },
            { id: "declined" as const, label: `Declined (${declined.length})` },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {/* Re-keyed on the tab so each list replays its entrance. */}
      <div key={tab} className="stagger mt-3 space-y-2.5">
        {shown.length === 0 && (
          <Empty
            title={
              tab === "open"
                ? "Nothing open in your name"
                : tab === "done"
                  ? "No repairs finished yet"
                  : "Nothing declined"
            }
            hint={
              tab === "open"
                ? "Report a fault and it will appear here with its owner and next update."
                : tab === "done"
                  ? "Once staff mark work fixed and you confirm it, it moves here."
                  : "A warden can rule a report out of scope. Those stay here so the reason is not lost."
            }
            action={
              tab === "open" ? (
                <Link
                  to="/complaints/new"
                  search={{ category: "" }}
                  onPointerDown={() => tapFeedback(8)}
                  className="pressable rounded-[18px] bg-[#0f4c3a] px-5 py-3 text-[13px] font-extrabold text-white"
                >
                  Report a fault
                </Link>
              ) : undefined
            }
          />
        )}
        {shown.map((c) => (
          <BulletinRow key={c.id} c={c} sub={`${c.roomLabel ?? "Your room"} · raised ${ageLabel(c.createdAt)}`} />
        ))}
      </div>

      {shown.length > 0 && (
        <Link
          to="/complaints/new"
          search={{ category: "" }}
          onPointerDown={() => tapFeedback(8)}
          className="pressable mt-3 flex items-center justify-center rounded-[18px] bg-[#0f4c3a] py-3.5 text-[14px] font-extrabold text-white"
        >
          Report a fault
        </Link>
      )}
    </AppShell>
  );
}
