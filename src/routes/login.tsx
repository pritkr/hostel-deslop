import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");

    const res = await authClient.signIn.email(
      { email: email.trim(), password },
      {
        onError: (ctx) => setErr(ctx.error.message || "Login failed"),
        onSuccess: () => nav({ to: "/dashboard" }),
      },
    );

    if (res?.error) setErr(res.error.message || "Login failed");
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-md pt-10">
      <div className="glass rise rounded-3xl p-6 sm:p-8">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-teal-700">
          Welcome back
        </p>
        <h1 className="font-display mt-1 text-2xl font-bold">Login to Hostel Care</h1>
        <p className="mt-1 text-sm text-slate-500">
          Students, staff, wardens — same door, role-aware inside.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block">
            <span className="text-xs font-bold text-slate-600">College email</span>
            <input
              className="mt-1 w-full rounded-xl border border-slate-900/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-600"
              placeholder="roll@ gecsheikhpura.ac.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Password</span>
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-slate-900/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-600"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {err ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{err}</p>
          ) : null}
          <button
            disabled={busy}
            className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Login"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-500">
          New student? <Link to="/signup" className="font-bold text-teal-700">Create account</Link>
        </p>
        <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          Demo: first user — sign up, then set role via Admin panel. Seed admin: promote via
          script <code>npm run promote -- email role</code>.
        </div>
      </div>
    </div>
  );
}
