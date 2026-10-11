import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "../lib/auth-client";
import { HOSTEL_OPTIONS } from "../utils/catalog";

export const Route = createFileRoute("/signup")({ component: Signup });

const DEPTS = ["CSE", "ECE", "EE", "ME", "CE", "MCT"];

function Signup() {
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", email: "", password: "", rollNo: "", dept: "CSE", year: 1, phone: "", hostelId: "BH1", roomLabel: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | number) => setF((p) => ({ ...p, [k]: v }));
  const inp = "mt-1 w-full rounded-xl border border-slate-900/15 bg-white px-3 py-2.5 text-sm";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");

    const res = await authClient.signUp.email(
      { email: f.email.trim(), password: f.password, name: f.name.trim(),
        // @ts-expect-error extra fields
        rollNo: f.rollNo.trim(), dept: f.dept, year: Number(f.year), phone: f.phone.trim(), hostelId: f.hostelId, roomId: f.roomLabel.trim() ? `${f.hostelId}-${f.roomLabel.trim()}` : null, gender: f.hostelId === "GH1" ? "F" : "M" },
      { onError: (ctx) => setErr(ctx.error.message || "Signup failed"), onSuccess: () => nav({ to: "/dashboard" }) },
    );

    if (res?.error) setErr(res.error.message || "Signup failed");
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-lg pt-10">
      <div className="glass rise rounded-3xl p-6 sm:p-8">
        <h1 className="font-display text-2xl font-bold">Create student account</h1>
        <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className="text-xs font-bold text-slate-600">Full name</span><input required className={inp} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Aashish Kumar" /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">College email</span><input required type="email" className={inp} value={f.email} onChange={(e) => set("email", e.target.value)} /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Password (8+)</span><input required minLength={8} type="password" className={inp} value={f.password} onChange={(e) => set("password", e.target.value)} /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Roll no</span><input required className={inp} value={f.rollNo} onChange={(e) => set("rollNo", e.target.value)} placeholder="23-CSE-042" /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Phone</span><input className={inp} value={f.phone} onChange={(e) => set("phone", e.target.value)} /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Branch</span><select className={inp} value={f.dept} onChange={(e) => set("dept", e.target.value)}>{DEPTS.map((d) => <option key={d}>{d}</option>)}</select></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Year</span><select className={inp} value={f.year} onChange={(e) => set("year", Number(e.target.value))}>{[1,2,3,4].map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Hostel</span><select className={inp} value={f.hostelId} onChange={(e) => set("hostelId", e.target.value)}>{HOSTEL_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Room</span><input required className={inp} value={f.roomLabel} onChange={(e) => set("roomLabel", e.target.value)} placeholder="204" /></label>
          {err ? <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700 sm:col-span-2">{err}</p> : null}
          <button disabled={busy} className="rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60 sm:col-span-2">{busy ? "Creating…" : "Create account"}</button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-500">Have an account? <Link to="/login" className="font-bold text-teal-700">Login</Link></p>
      </div>
    </div>
  );
}
