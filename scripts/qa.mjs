const BASE = "http://localhost:3000";

async function login(email, password) {
  const jar = [];

  const r = await fetch(`${BASE}/api/auth/sign-in/email`, { method: "POST",
    headers: { "content-type": "application/json", origin: BASE, cookie: jar.join("; ") },
    body: JSON.stringify({ email, password }), redirect: "manual" });

  const sc = r.headers.getSetCookie?.() ?? [];

  for (const c of sc) jar.push(c.split(";")[0]);

  return { cookie: jar.join("; "), ok: r.ok };
}

async function get(path, cookie) {
  const r = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
  const t = await r.text();

  return { status: r.status, loc: r.headers.get("location"), body: t };
}

const ACCOUNTS = [
  ["student@gec.edu", "student123", "student"],
  ["gaurav@gec.edu", "staff12345", "staff"],
  ["kamal@gec.edu", "warden12345", "warden"],
  ["chitranjan@gec.edu", "admin12345", "admin"],
];

const results = [];

for (const [email, pw, role] of ACCOUNTS) {
  const { cookie, ok } = await login(email, pw);

  if (!ok) { results.push([role, email, "LOGIN FAILED", ""]); continue; }

  const pages = {
    student: ["/bulletin", "/my", "/contacts", "/complaints/new", "/updates"],
    staff: ["/queue", "/my", "/contacts"],
    warden: ["/attention", "/queue", "/my", "/contacts"],
    admin: ["/admin", "/attention", "/queue", "/my", "/contacts"],
  }[role];

  for (const p of pages) {
    const r = await get(p, cookie);
    const note = r.status === 200 ? "ok" : `${r.status}${r.loc ? " -> " + r.loc : ""}`;
    results.push([role, p, r.status, note]);
  }
}

console.table(results.map(([role, page, status, note]) => ({ role, page, status: String(status), note })));
