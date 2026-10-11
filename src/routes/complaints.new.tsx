import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Camera, Check, ChevronLeft, ChevronRight, Droplets, Home, Armchair as ChairIcon, Sparkles, Zap } from "lucide-react";
import { getSession } from "../lib/auth-functions";
import { createComplaint } from "../lib/complaint-create";
import { listRooms } from "../lib/rooms-functions";
import { HOSTEL_OPTIONS } from "../utils/catalog";
import { AppShell } from "../components/AppShell";
import { RoomPicker } from "../components/RoomPicker";
import { tapFeedback, useToast } from "../components/motion";

/**
 * The only search param is a pre-selected category, which arrives from a link on
 * the bulletin. Anything absent or non-string is treated as "no preselection"
 * rather than an error, so a hand-edited URL still renders the form.
 */
const complaintSearchSchema = z.object({ category: z.string().max(32).optional() }).loose();

export const Route = createFileRoute("/complaints/new")({
  validateSearch: (search) => complaintSearchSchema.parse(search),
  beforeLoad: async () => {
    const s = await getSession();

    if (!s) throw redirect({ to: "/login" });

    return { me: s.user };
  },
  component: NewComplaint,
});

const QUICK = [
  { id: "electrical", label: "Electricity", icon: <Zap size={18} /> },
  { id: "plumbing", label: "Plumbing", icon: <Droplets size={18} /> },
  { id: "furniture", label: "Furniture", icon: <ChairIcon size={18} /> },
  { id: "cleaning", label: "Cleaning", icon: <Sparkles size={18} /> },
];

const SHARED = ["Corridor light", "Common bathroom", "Mess hall", "Water cooler", "Stairs / lobby", "Terrace"];

const HOSTELS = HOSTEL_OPTIONS;

function NewComplaint() {
  const ctx = Route.useRouteContext();
  const sq = Route.useSearch();
  const nav = useNavigate();
  // The account stores a full room key ("BH1-204"); the picker and every
  // complaint label speak in bare room numbers ("204"), so strip the prefix.
  const myRoomNo = (ctx.me.roomId ?? "").split("-").pop() ?? "";
  const [f, setF] = useState({ hostelId: ctx.me.hostelId || "BH1", roomLabel: myRoomNo, myRoom: true, shared: "", category: sq.category || "electrical", title: "", description: "", priv: false });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const toast = useToast();

  async function submit() {
    setBusy(true);
    setErr("");

    try {
      const where = f.myRoom ? f.roomLabel.trim() : `${f.shared} (shared)`;
      const q = QUICK.find((x) => x.id === f.category);
      const title = f.title.trim() || `${q?.label ?? f.category} - ${where}`;

      // A room picked from the sheet must resolve to a real rooms row, otherwise
      // the address on the repair stays free text and wardens cannot filter by it.
      const picked = f.myRoom
        ? (await listRooms({ data: { hostelId: f.hostelId } })).find(
            (r) => r.roomNo === f.roomLabel,
          )
        : undefined;

      const r = await createComplaint({
        data: {
          hostelId: f.hostelId,
          roomLabel: where || "shared",
          roomId: picked?.id ?? null,
          floor: picked?.floor,
          category: f.category,
          title,
          description: (f.description.trim() || title).slice(0, 500),
          confidential: f.priv,
        },
      });

      // Confirm before moving on: the resident must know it was received.
      toast.push({
        title: "Report submitted",
        detail: f.priv ? "Kept private to staff." : "Visible to your hostel on the bulletin.",
      });
      nav({ to: "/complaints/$id", params: { id: r.id } });
    } catch (e2) {
      const msg = e2 instanceof Error ? e2.message : "Failed";
      setErr(msg);
      toast.push({ title: "Could not submit", detail: msg, tone: "warn" });
    }

    setBusy(false);
  }

  return (
    <AppShell>
      <div className="flex items-center gap-2 px-1">
        <Link to="/bulletin" className="grid h-8 w-8 place-items-center rounded-full bg-white ring-1 ring-slate-900/10"><ChevronLeft size={16} /></Link>
        <div><h1 className="text-lg font-extrabold leading-tight">Report a fault</h1><p className="text-[11px] text-slate-500">Let us know what needs attention</p></div>
      </div>
      <Steps />
      <div className="mt-3 rounded-3xl bg-white p-4 ring-1 ring-slate-900/5">
        <p className="text-[13px] font-extrabold">1. What&apos;s the issue?</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {QUICK.map((q) => (
            <button
              key={q.id}
              onPointerDown={() => tapFeedback(6)}
              onClick={() => set("category", q.id)}
              className={
                f.category === q.id
                  ? "pressable flex items-center gap-2 rounded-2xl bg-[#e6f4ec] px-3 py-3.5 text-[13px] font-extrabold text-[#0f4c3a] ring-1 ring-[#0f4c3a]/40"
                  : "pressable flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-3.5 text-[13px] font-bold text-slate-500 ring-1 ring-slate-900/5"
              }
            >
              <span className={f.category === q.id ? "check-pop" : ""}>{q.icon}</span>
              {q.label}
            </button>
          ))}
        </div>
        <p className="mt-4 text-[13px] font-extrabold">2. Where is it?</p>
        <div className="mt-2 space-y-2">
          <button
            type="button"
            onClick={() => {
              set("myRoom", true);
              setPicker(true);
            }}
            className={`pressable flex w-full items-center gap-2.5 rounded-2xl px-3 py-3 text-left text-[13px] font-bold ring-1 ${
              f.myRoom
                ? "bg-[#e6f4ec] text-[#0f4c3a] ring-[#0f4c3a]/40"
                : "bg-slate-50 text-slate-500 ring-slate-900/5"
            }`}
          >
            <Home size={15} className="shrink-0" />
            <span className="flex-1">My room</span>
            <span className="flex items-center gap-1 text-[12px] font-extrabold">
              {f.roomLabel || "Choose room"}
              <ChevronRight size={14} />
            </span>
          </button>
          <label className="flex items-center gap-2.5 text-[13px] font-bold text-slate-500">
            <input
              type="radio"
              checked={!f.myRoom}
              onChange={() => set("myRoom", false)}
              className="h-4 w-4 shrink-0 accent-[#0f4c3a]"
            />
            Shared area
            <select
              value={f.shared}
              onChange={(e) => set("shared", e.target.value)}
              className="ml-auto w-40 rounded-xl bg-slate-50 px-2 py-2.5 text-[16px] outline-none ring-1 ring-slate-900/10"
            >
              <option value="">Select area</option>
              {SHARED.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-4 text-[13px] font-extrabold">3. Tell us more</p>
        <input
          value={f.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="e.g. Fan not working"
          className="mt-2 w-full rounded-2xl bg-slate-50 px-3 py-3 text-[16px] outline-none ring-1 ring-slate-900/10"
        />
        <div className="relative mt-2">
          <textarea
            value={f.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Brief description…"
            className="w-full rounded-2xl bg-slate-50 px-3 py-3 text-[16px] outline-none ring-1 ring-slate-900/10"
          />
          <span className="tnum absolute bottom-2.5 right-3 text-[10px] text-slate-400">{f.description.length}/500</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-slate-50 p-3 text-center ring-1 ring-slate-900/10">
            <Camera size={18} className="mx-auto text-slate-400" />
            <p className="mt-1 text-[11px] font-bold text-slate-500">Add photo on next screen</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-2.5 text-[11px] font-bold ring-1 ring-slate-900/10">
            <p>Visibility</p>
            <label className="pressable-sm mt-1 flex items-center gap-1.5 rounded-lg px-1 py-1 font-semibold text-slate-600">
              <input type="radio" checked={!f.priv} onChange={() => set("priv", false)} className="accent-[#0f4c3a]" /> Visible to hostel
            </label>
            <label className="pressable-sm mt-1 flex items-center gap-1.5 rounded-lg px-1 py-1 font-semibold text-slate-600">
              <input type="radio" checked={f.priv} onChange={() => set("priv", true)} className="accent-[#0f4c3a]" /> Private to staff
            </label>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[12px]">
          <span>Hostel</span>
          <select value={f.hostelId} onChange={(e) => set("hostelId", e.target.value)} className="rounded-xl bg-slate-50 px-2 py-1.5 font-bold outline-none ring-1 ring-slate-900/10">
            {HOSTELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {err && (
          <p className="pop-in mt-2 rounded-xl bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">{err}</p>
        )}
        <button
          disabled={busy}
          onPointerDown={() => tapFeedback(12)}
          onClick={submit}
          className="pressable mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0f4c3a] py-3.5 text-sm font-extrabold text-white disabled:opacity-60"
        >
          {busy && (
            <span
              className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white"
              style={{ animation: "spin 720ms linear infinite" }}
            />
          )}
          {busy ? "Submitting…" : "Submit report"}
        </button>
      </div>

      <RoomPicker
        open={picker}
        onClose={() => setPicker(false)}
        hostelId={f.hostelId}
        value={f.roomLabel}
        onChange={(roomNo) => set("roomLabel", roomNo)}
        myRoomId={ctx.me.roomId}
      />
    </AppShell>
  );
}

function Steps() {
  const steps = [
    { label: "Issue details", n: 1 },
    { label: "Location", n: 2 },
    { label: "Review", n: 3 },
  ];

  return (
    <div className="mt-3 flex items-start px-1">
      {steps.map((s, i) => {
        const on = i === 0;

        return (
          <div key={s.label} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 rounded-full ${i === 0 ? "bg-transparent" : "bg-slate-900/10"}`} />
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11.5px] font-extrabold ${
                  on ? "bg-[#0f4c3a] text-white" : "bg-white text-slate-400 ring-1 ring-slate-900/10"
                }`}
              >
                {on ? <Check size={13} strokeWidth={3} className="check-pop" /> : s.n}
              </span>
              <span className={`h-0.5 flex-1 rounded-full ${i === 0 ? "bg-slate-900/10" : "bg-transparent"}`} />
            </div>
            <span className={`text-[10px] font-extrabold ${on ? "text-[#0f4c3a]" : "text-slate-400"}`}>
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}


