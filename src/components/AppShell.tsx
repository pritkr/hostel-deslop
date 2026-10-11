import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle, Bell, CalendarDays, ClipboardList, Home, LogOut, Menu, Phone, Plus, User, X,
} from "lucide-react";
import { authClient } from "../lib/auth-client";
import { isUserRole, type UserRole } from "../lib/auth-fields";
import { usePresence } from "./motion";

/**
 * The role shown in the shell comes from two places: the route's own
 * `beforeLoad` context, or the Better Auth client session. Both are resolved to
 * the same closed set, so a role arriving from the server is narrowed through
 * `isUserRole` rather than trusted as an arbitrary string.
 */
function resolveRole(...candidates: (string | null | undefined)[]): UserRole {
  for (const candidate of candidates) {
    if (candidate && isUserRole(candidate)) return candidate;
  }

  return "student";
}

function homeFor(role: UserRole) {
  if (role === "staff") return "/queue";

  if (role === "warden" || role === "admin") return "/attention";

  return "/bulletin";
}

/**
 * Mobile shell: cream paper, centred GEC HOSTEL wordmark, role-aware primary
 * action icon on the right, and a three-tab bottom nav (Home / My reports /
 * Contacts) as in the resident bulletin mockup. The hamburger opens a flat
 * link sheet — no nested navigation trees.
 *
 * Motion: the sheet slides on a spring and releases faster than it entered,
 * the active tab lifts on a spring, and route content settles in from just
 * below its resting position.
 */
export function AppShell({ children, role }: { children: React.ReactNode; role?: UserRole }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data } = authClient.useSession();
  const r = resolveRole(role, data?.user?.role);
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const home = homeFor(r);
  const { mounted: menuMounted, closing: menuClosing } = usePresence(menu, 200);

  // A native drawer closes on navigation, not just on its own close button.
  useEffect(() => setMenu(false), [pathname]);

  // Lock the page behind an open sheet so content cannot scroll under it.
  useEffect(() => {
    if (!menu) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prev;
    };
  }, [menu]);

  useEffect(() => {
    if (!menu) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const tabs = [
    { to: home, label: "Home", icon: <Home size={20} strokeWidth={2.2} /> },
    { to: "/my", label: "My reports", icon: <ClipboardList size={20} strokeWidth={2.2} /> },
    { to: "/contacts", label: "Contacts", icon: <Phone size={20} strokeWidth={2.2} /> },
  ];

  const Right =
    r === "staff" ? (
      <Link to="/queue" aria-label="This shift" className="pressable grid h-9 w-9 place-items-center rounded-full bg-white ring-1 ring-slate-900/10">
        <CalendarDays size={17} />
      </Link>
    ) : r === "warden" || r === "admin" ? (
      <Link to="/attention" aria-label="Needs attention" className="pressable grid h-9 w-9 place-items-center rounded-full bg-white text-amber-500 ring-1 ring-slate-900/10">
        <AlertTriangle size={17} />
      </Link>
    ) : (
      <Link to="/updates" aria-label="Updates" className="pressable grid h-9 w-9 place-items-center rounded-full bg-white ring-1 ring-slate-900/10">
        <Bell size={17} />
      </Link>
    );

  const links: { to: string; label: string }[] = [
    { to: home, label: r === "staff" ? "Shift slate" : r === "warden" || r === "admin" ? "Needs attention" : "Repair bulletin" },
    { to: "/bulletin", label: "Repair bulletin" },
    { to: "/my", label: "My reports" },
    { to: "/updates", label: "Recently repaired" },
    { to: "/contacts", label: "Staff directory" },
    ...(["staff", "warden", "admin"].includes(r) ? [{ to: "/queue", label: "Staff queue" }] : []),
    ...(["warden", "admin"].includes(r) ? [{ to: "/attention", label: "Needs attention" }] : []),
    ...(r === "admin" ? [{ to: "/admin", label: "Admin console" }] : []),
  ];

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-[430px] bg-[#fdf8ee] pb-24 shadow-[0_0_60px_-30px_rgba(23,35,59,0.35)] ring-1 ring-slate-900/[0.06]">
      <header className="sticky top-0 z-30 border-b border-slate-900/10 bg-[#fdf8ee]/92 backdrop-blur-xl">
        <div className="relative flex items-center gap-2 px-2 py-3">
          <button
            onClick={() => setMenu(true)}
            aria-label="Menu"
            className="pressable grid h-9 w-9 place-items-center rounded-full text-slate-700"
          >
            <Menu size={19} />
          </button>
          <span className="pointer-events-none absolute inset-x-0 mx-auto w-fit">
            <span className="text-[15px] font-extrabold tracking-[0.16em] text-[#0f2b23]">GEC HOSTEL</span>
          </span>
          <span className="ml-auto" />
          {Right}
        </div>
      </header>

      {/* Keyed on the path so every route change replays the entrance. */}
      <div key={pathname} className="page-enter px-3 pt-3">
        {children}
      </div>

      <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-slate-900/10 bg-white/92 backdrop-blur-xl">
        <div className="grid grid-cols-3 items-end px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
          {tabs.map((t) => {
            const on = pathname === t.to;

            return (
              <Link
                key={t.label}
                to={t.to}
                data-active={on}
                aria-current={on ? "page" : undefined}
                className={`tab-item relative flex flex-col items-center gap-1 py-1 text-[10.5px] font-bold ${on ? "text-[#0f4c3a]" : "text-slate-400"}`}
              >
                <span className="relative grid place-items-center">
                  <span className="tab-icon grid place-items-center">{t.icon}</span>
                  {/* The marker exists only for the active tab, and grows in. */}
                  <span
                    className={`tab-dot absolute -bottom-1 h-1 w-1 rounded-full bg-[#0f4c3a] ${
                      on ? "scale-100 opacity-100" : "scale-0 opacity-0"
                    }`}
                  />
                </span>
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {menuMounted && (
        <div className="fixed inset-0 z-50 flex">
          <button
            aria-label="Close menu"
            onClick={() => setMenu(false)}
            className={`flex-1 bg-slate-900/30 backdrop-blur-sm ${menuClosing ? "scrim closing" : "scrim"}`}
          />
          <div
            className={`w-[284px] overflow-y-auto overscroll-contain bg-[#fdf8ee] p-4 shadow-xl ${
              menuClosing ? "drawer-out" : "drawer-in"
            }`}
          >
            <div className="flex items-center">
              <p className="text-[12px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Menu</p>
              <button
                onClick={() => setMenu(false)}
                aria-label="Close"
                className="pressable ml-auto grid h-8 w-8 place-items-center rounded-full bg-white ring-1 ring-slate-900/10"
              >
                <X size={15} />
              </button>
            </div>
            <div className="stagger mt-3 space-y-1">
              {links.map((l) => {
                const on = pathname === l.to;

                return (
                  <Link
                    key={l.label}
                    to={l.to}
                    onClick={() => setMenu(false)}
                    className={`row-press block rounded-xl px-3 py-2.5 text-[13px] font-bold ${
                      on ? "bg-white text-[#0f4c3a] ring-1 ring-slate-900/10" : "text-slate-700"
                    }`}
                  >
                    {l.label}
                  </Link>
                );
              })}
            </div>
            <Link
              to="/complaints/new"
              search={{ category: "" }}
              onClick={() => setMenu(false)}
              className="pressable mt-3 flex items-center justify-center gap-2 rounded-2xl bg-[#0f4c3a] py-3 text-[13px] font-extrabold text-white"
            >
              <Plus size={16} strokeWidth={3} /> Report a fault
            </Link>
            <button
              onClick={async () => {
                await authClient.signOut();
                nav({ to: "/login" });
              }}
              className="pressable mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3 text-[13px] font-bold text-slate-600 ring-1 ring-slate-900/10"
            >
              <LogOut size={15} /> Sign out
            </button>
            <p className="mt-3 flex items-center gap-1.5 text-[10.5px] text-slate-400">
              <User size={12} /> {data?.user?.name ?? "Resident"} · {r}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
