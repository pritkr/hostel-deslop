import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { adminUsers, adminSetRole, adminCreateStaff } from "../lib/admin-functions";
import { STAFF_ROLES, USER_ROLES, isUserRole, type UserRole } from "../lib/auth-fields";
import { HOSTEL_OPTIONS } from "../utils/catalog";
import { AppShell } from "./AppShell";
import { tapFeedback, useToast } from "./motion";

type Stats = {
  total: number;
  users: number;
  byStatus: Record<string, number>;
  byCat: Record<string, number>;
  byHostel: Record<string, number>;
  byRole: Record<string, number>;
};

type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  hostelId: string | null;
};

type NewStaffForm = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  hostelId: string;
};

const EMPTY_NEW_STAFF: NewStaffForm = {
  name: "",
  email: "",
  password: "staff12345",
  role: "staff",
  hostelId: "BH1",
};

export function AdminPage({ stats: initial }: { stats: Stats }) {
  const [stats] = useState(initial);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nf, setNf] = useState<NewStaffForm>(EMPTY_NEW_STAFF);

  // The role each row's dropdown is showing, keyed by user id. Holding it in
  // state means Save reads the choice React already owns, instead of reaching
  // back into the DOM for an element it never rendered itself.
  const [pendingRoles, setPendingRoles] = useState<Record<string, UserRole>>({});
  const toast = useToast();
  const router = useRouter();

  async function load() {
    setLoading(true);

    try {
      setUsers(await adminUsers({ data: {} }));
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }

  /** Bars grow from zero on mount — the value is the point, so animate it. */
  const bar = (obj: Record<string, number>) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v], i) => (
        <div key={k} className="flex items-center gap-2 text-[11.5px]">
          <span className="w-24 shrink-0 truncate font-bold capitalize">{k.replace(/_/g, " ")}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <span
              className="block h-full rounded-full bg-[#0f4c3a]"
              style={{
                width: `${Math.min(100, (v / Math.max(1, stats.total)) * 100)}%`,
                transition: `width var(--dur-5) var(--ease-out) ${i * 60}ms`,
              }}
            />
          </span>
          <b className="tnum w-6 shrink-0 text-right">{v}</b>
        </div>
      ));

  const statTiles: readonly (readonly [string, number])[] = [
    ["Complaints", stats.total],
    ["People", stats.users],
    ["Staff + wardens", (stats.byRole.staff ?? 0) + (stats.byRole.warden ?? 0)],
    ["Students", stats.byRole.student ?? 0],
  ];

  return (
    <AppShell role="admin">
      <h1 className="px-1 text-[26px] font-extrabold leading-tight text-[#0f2b23]">Admin</h1>
      <p className="mt-0.5 px-1 text-[11.5px] text-slate-500">
        Superintendent view across every hostel · roles decide what a person can see
      </p>

      <div className="stagger mt-3 grid grid-cols-2 gap-2">
        {statTiles.map(([k, v]) => (
          <div key={k} className="rounded-[18px] bg-white px-3.5 py-3 ring-1 ring-slate-900/[0.06]">
            <p className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">{k}</p>
            <p className="tnum mt-0.5 text-2xl font-extrabold text-[#0f2b23]">{v}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-2.5">
        {([["By status", stats.byStatus], ["By category", stats.byCat], ["By hostel", stats.byHostel]] as const).map(
          ([label, obj]) => (
            <div key={label} className="rounded-[18px] bg-white p-4 ring-1 ring-slate-900/[0.06]">
              <h2 className="text-[12px] font-extrabold text-slate-700">{label}</h2>
              <div className="mt-2.5 space-y-2">{bar(obj)}</div>
            </div>
          ),
        )}
      </div>

      <div className="mt-3 rounded-[18px] bg-white p-4 ring-1 ring-slate-900/[0.06]">
        <h2 className="text-[12px] font-extrabold text-slate-700">Create staff / warden login</h2>
        <div className="mt-2.5 space-y-2">
          <input
            value={nf.name}
            onChange={(e) => setNf({ ...nf, name: e.target.value })}
            placeholder="Full name"
            className="w-full rounded-xl bg-slate-50 px-3 py-3 text-[16px] outline-none ring-1 ring-slate-900/10"
          />
          <input
            value={nf.email}
            onChange={(e) => setNf({ ...nf, email: e.target.value })}
            placeholder="Email"
            type="email"
            className="w-full rounded-xl bg-slate-50 px-3 py-3 text-[16px] outline-none ring-1 ring-slate-900/10"
          />
          <input
            value={nf.password}
            onChange={(e) => setNf({ ...nf, password: e.target.value })}
            placeholder="Temporary password"
            className="w-full rounded-xl bg-slate-50 px-3 py-3 text-[16px] outline-none ring-1 ring-slate-900/10"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={nf.role}
              onChange={(e) => {
                const role = e.target.value;

                if (isUserRole(role)) setNf({ ...nf, role });
              }}
              className="rounded-xl bg-slate-50 px-3 py-3 text-[16px] font-bold outline-none ring-1 ring-slate-900/10"
            >
              {STAFF_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <select
              value={nf.hostelId}
              onChange={(e) => setNf({ ...nf, hostelId: e.target.value })}
              className="rounded-xl bg-slate-50 px-3 py-3 text-[16px] font-bold outline-none ring-1 ring-slate-900/10"
            >
              {HOSTEL_OPTIONS.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button
            onPointerDown={() => tapFeedback(12)}
            onClick={async () => {
              try {
                await adminCreateStaff({ data: nf });
                toast.push({ title: `${nf.name} created`, detail: "They can sign in with the temporary password." });
                setNf({ ...nf, name: "", email: "" });
                router.invalidate();
              } catch (e) {
                toast.push({
                  title: "Could not create the account",
                  detail: e instanceof Error ? e.message : undefined,
                  tone: "warn",
                });
              }
            }}
            className="pressable w-full rounded-2xl bg-[#0f4c3a] py-3.5 text-[13px] font-extrabold text-white"
          >
            Create login
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-[18px] bg-white p-4 ring-1 ring-slate-900/[0.06]">
        <div className="flex items-center gap-2">
          <h2 className="text-[12px] font-extrabold text-slate-700">People &amp; roles</h2>
          <button
            onClick={load}
            className="pressable ml-auto rounded-full bg-slate-50 px-3 py-2 text-[11.5px] font-bold text-slate-600 ring-1 ring-slate-900/10"
          >
            {loading ? "Loading…" : loaded ? "Reload" : "Load people"}
          </button>
        </div>
        {loaded && users.length === 0 && <p className="mt-3 text-[12px] text-slate-500">No accounts found.</p>}
        {loaded && (
          <div key={`users-${users.length}`} className="stagger mt-3 space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3 text-[12px]">
                <b className="min-w-0 truncate">{u.name}</b>
                <span className="truncate text-slate-500">{u.email}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10.5px] font-extrabold text-[#0f4c3a]">{u.role}</span>
                <select
                  value={pendingRoles[u.id] ?? (isUserRole(u.role) ? u.role : "student")}
                  onChange={(e) => {
                    const role = e.target.value;

                    if (isUserRole(role)) {
                      setPendingRoles((current) => ({ ...current, [u.id]: role }));
                    }
                  }}
                  className="ml-auto rounded-full bg-white px-2 py-2 text-[16px] font-bold outline-none ring-1 ring-slate-900/10"
                >
                  {USER_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <button
                  onPointerDown={() => tapFeedback(8)}
                  onClick={async () => {
                    const role = pendingRoles[u.id] ?? (isUserRole(u.role) ? u.role : "student");
                    await adminSetRole({ data: { userId: u.id, role, hostelId: u.hostelId ?? "BH1" } });
                    toast.push({ title: `${u.name} is now ${role}` });
                    router.invalidate();
                  }}
                  className="pressable rounded-full bg-[#0f4c3a] px-3.5 py-2 text-[11.5px] font-extrabold text-white"
                >
                  Save
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
