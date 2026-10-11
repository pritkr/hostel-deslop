import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Phone, Search } from "lucide-react";
import { getSession } from "../lib/auth-functions";
import { staffDirectory } from "../lib/directory-functions";
import { AppShell } from "../components/AppShell";
import { tapFeedback } from "../components/motion";
import { AVATAR_TONES, initials } from "../utils/bulletin";

export const Route = createFileRoute("/contacts")({
  beforeLoad: async () => {
    const s = await getSession();

    if (!s) throw redirect({ to: "/login" });

    return { me: s.user };
  },
  loader: async () => staffDirectory({ data: {} }),
  component: Directory,
});

type Person = {
  id: string; name: string; title: string; scope: string; phone: string | null; onDuty: boolean; until: string;
  image: string | null;
};

/**
 * A person's face, or their initials. The photo fades in over the initials
 * rather than replacing them, so a slow connection never shows an empty hole
 * and a broken image degrades to something readable instead of a blank circle.
 */
function Face({ p, tone, size = "h-11 w-11 text-[13px]" }: { p: Person; tone: string; size?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full ${tone} ${size}`}>
      <span className="font-extrabold">{initials(p.name)}</span>
      {p.image && !failed && (
        <img
          src={p.image}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </span>
  );
}

function PersonRow({ p, i }: { p: Person; i: number }) {
  const tone = AVATAR_TONES[i % AVATAR_TONES.length];

  return (
    <div className="row-hover flex items-center gap-3 rounded-[18px] bg-white px-3 py-3 ring-1 ring-slate-900/[0.06]">
      <Face p={p} tone={tone} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-extrabold leading-tight">{p.title}</span>
        <span className="mt-0.5 block truncate text-[11.5px] text-slate-500">{p.name} · {p.scope}</span>
        <span className={`mt-0.5 flex items-center gap-1 truncate text-[11.5px] font-bold ${p.onDuty ? "text-[#1a7f4b]" : "text-slate-400"}`}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.onDuty ? "bg-[#1a7f4b]" : "bg-slate-300"}`} />
          {p.onDuty ? `On duty until ${p.until}` : `Office hours until ${p.until}`}
        </span>
      </span>
      {p.phone ? (
        <a
          href={`tel:${p.phone}`}
          onPointerDown={() => tapFeedback(12)}
          className="pressable flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-2.5 text-[12px] font-extrabold text-[#0f4c3a] ring-1 ring-[#0f4c3a]/30"
        >
          <Phone size={13} /> Call
        </a>
      ) : (
        <span className="shrink-0 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] font-bold text-slate-400 ring-1 ring-slate-200">
          No. at hostel office
        </span>
      )}
    </div>
  );
}

function Directory() {
  const initial = Route.useLoaderData();
  const [q, setQ] = useState("");
  const [dir, setDir] = useState(initial);
  const [searching, setSearching] = useState(false);

  // Search stays responsive: the field never waits on a keystroke, only the
  // list behind it refreshes, and the result set pops in when it lands.
  async function onSearch(value: string) {
    setQ(value);
    setSearching(true);

    try {
      setDir(await staffDirectory({ data: { q: value } }));
    } finally {
      setSearching(false);
    }
  }

  return (
    <AppShell>
      <h1 className="px-1 text-[26px] font-extrabold leading-tight text-[#0f2b23]">Staff Directory</h1>
      <p className="mt-0.5 px-1 text-[11.5px] text-slate-500">Approved duty contacts for maintenance · calls open your dialer</p>

      <label className="pressable-sm mt-3 flex items-center gap-2 rounded-[18px] bg-white px-3 py-3 ring-1 ring-slate-900/[0.06] focus-within:ring-[#0f4c3a]/30">
        <Search size={15} className="shrink-0 text-slate-400" />
        <input
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by name, role or area…"
          className="w-full bg-transparent text-[16px] outline-none placeholder:text-slate-400"
        />
        {searching && <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-[#0f4c3a]/25 border-t-[#0f4c3a]" style={{ animation: "spin 720ms linear infinite" }} />}
      </label>

      <div className="fade-in mt-3 flex items-center gap-1.5 px-1">
        <span className="h-2 w-2 rounded-full bg-[#1a7f4b]" />
        <p className="text-[12px] font-extrabold text-slate-700">On duty now</p>
      </div>
      <div key={`duty-${q}`} className="stagger mt-2 space-y-2.5">
        {dir.onDuty.length === 0 && (
          <p className="pop-in rounded-[18px] bg-white p-6 text-center text-[13px] text-slate-500">
            No staff match that search.
          </p>
        )}
        {dir.onDuty.map((p, i) => <PersonRow key={p.id} p={p} i={i} />)}
      </div>

      {dir.others.length > 0 && (
        <>
          <p className="fade-in mt-4 px-1 text-[12px] font-extrabold text-slate-700">Escalate to</p>
          <div key={`esc-${q}`} className="stagger mt-2 space-y-2.5">
            {dir.others.map((p, i) => <PersonRow key={p.id} p={p} i={i + dir.onDuty.length} />)}
          </div>
        </>
      )}

      <p className="mt-3 px-1 text-center text-[11px] text-slate-400">
        Only contacts approved for resident use are listed · a call is never logged as contact automatically
      </p>
    </AppShell>
  );
}
