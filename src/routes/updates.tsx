import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { getSession } from "../lib/auth-functions";
import { hostelBoard } from "../lib/board-functions";
import { listNotices } from "../lib/notice-functions";
import { AppShell } from "../components/AppShell";
import { BulletinRow, Empty, IncidentNotice } from "../components/bulletin-ui";
import { ageLabel, hostelName } from "../utils/bulletin";

export const Route = createFileRoute("/updates")({
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

    return { board, notices };
  },
  component: Updates,
});

function Updates() {
  const { board, notices } = Route.useLoaderData();

  return (
    <AppShell>
      <h1 className="px-1 text-[26px] font-extrabold leading-tight text-[#0f2b23]">Recently repaired</h1>
      <p className="mt-0.5 px-1 text-[11.5px] text-slate-500">
        {hostelName(board.hostelId)} · completed work stays readable, with its story
      </p>

      <div className="stagger mt-3 space-y-2.5">
        {board.repaired.length === 0 && (
          <Empty
            title="Nothing confirmed yet"
            hint="Staff mark work fixed, then the resident confirms. Until then the item stays on the bulletin as unresolved."
          />
        )}
        {board.repaired.map((c) => (
          <BulletinRow key={c.id} c={c} sub={`${c.roomLabel ? `${c.roomLabel} · ` : ""}${hostelName(c.hostelId)} · fixed ${ageLabel(c.updatedAt ?? c.createdAt)}`} />
        ))}
      </div>

      {notices.length > 0 && (
        <div className="mt-4 space-y-2.5">
          <p className="px-1 text-[12px] font-extrabold text-slate-700">Notices for residents</p>
          {notices.slice(0, 5).map((n) => (
            <IncidentNotice key={n.id} n={n} when={ageLabel(new Date(n.createdAt).getTime())} />
          ))}
        </div>
      )}

      <Link to="/bulletin" className="mt-3 block text-center text-[12px] font-bold text-[#0f4c3a]">
        ← Back to the repair bulletin
      </Link>
    </AppShell>
  );
}
