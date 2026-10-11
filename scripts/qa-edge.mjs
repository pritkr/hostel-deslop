// Adversarial pass: cross-resident tampering, missing-entity handling, and
// input validation. These are the cases a role matrix never reaches.
// Run: node scripts/qa-edge.mjs
import { BASE, call, check, results, FN, who, login } from "./qa-lib.mjs";

const stamp = Date.now().toString().slice(-5);

const call_ = (name, cookie, payload) => call(FN[name], name, cookie, payload);

// A guard that holds is a FAIL here: these steps assert the action is refused.
const bad = (role, step, res, why) =>
  check(role, step, !!res.error, res.error ? `blocked: ${res.error}` : `ALLOWED (${why})`);

async function mk(cookie, over = {}) {
  const r = await call_("createComplaint", cookie, {
    hostelId: "BH1", roomLabel: "204", category: "electrical",
    title: "edge case probe " + stamp, description: "adversarial probe for the edge suite.",
    ...over,
  });

  return r.result?.id;
}

// A second student exists purely as the "other resident" in these tests.
const otherEmail = `edge${stamp}@gec.edu`;

await fetch(`${BASE}/api/auth/sign-up/email`, {
  method: "POST", headers: { "content-type": "application/json", origin: BASE },
  body: JSON.stringify({ name: "Edge Other", email: otherEmail, password: "edgepass123", rollNo: `E-${stamp}` }),
});

const other = await login(otherEmail, "edgepass123");

const S = who.student, T = who.staff, W = who.warden, A = who.admin;

// The reporter is capped at 10 open complaints, and this suite creates several.
// Close out whatever is already open so each run starts from a clean slate —
// otherwise later cases fail on the cap instead of on what they are testing.
const mine = await call_("listComplaints", S, { scope: "mine", limit: 200 });

for (const x of mine.result ?? []) {
  if (!["submitted", "acknowledged", "in_progress", "reopened"].includes(x.status)) continue;

  if (x.status === "submitted") await call_("claimComplaint", T, { id: x.id });

  if (["submitted", "acknowledged"].includes(x.status)) {
    await call_("transitionComplaint", T, { id: x.id, to: "acknowledged" });
  }

  if (["acknowledged", "in_progress", "reopened"].includes(x.status)) {
    await call_("transitionComplaint", T, { id: x.id, to: "in_progress" });
  }

  await call_("transitionComplaint", T, { id: x.id, to: "resolved" });
  await call_("transitionComplaint", S, { id: x.id, to: "closed" });
}

// --- A. Can one resident reopen a repair that is not theirs? ---------------
{
  const id = await mk(S);
  await call_("claimComplaint", T, { id });
  await call_("transitionComplaint", T, { id, to: "in_progress" });
  await call_("transitionComplaint", T, { id, to: "resolved" });
  await call_("transitionComplaint", S, { id, to: "closed" });
  const r = await call_("transitionComplaint", other, { id, to: "reopened", remark: "not my repair" });
  bad("cross-resident", "other student cannot reopen someone else's repair", r, "transitionComplaint reopened");
  const g = await call_("getComplaint", S, { id });
  check("cross-resident", "reopen was not persisted", g.result?.complaint?.status === "closed",
    `status now ${g.result?.complaint?.status}`);
}

// --- B. Can a resident write into a complaint they cannot see? --------------
{
  const id = await mk(S, { confidential: true });
  const r = await call_("addComment", other, { id, body: "injecting into a private complaint" });
  bad("privacy", "other student cannot comment on a confidential complaint", r, "addComment");
  const g = await call_("getComplaint", T, { id });
  const leaked = (g.result?.comments ?? []).some((c) => c.body?.includes("injecting"));
  check("privacy", "injected comment did not surface for staff", !leaked, leaked ? "comment is visible" : "");
}

// --- C. Actions against a complaint that does not exist --------------------
{
  const ghost = "GEC-H-1999-9999";
  bad("missing-entity", "claim on a nonexistent complaint", await call_("claimComplaint", T, { id: ghost }), "claimComplaint");
  bad("missing-entity", "comment on a nonexistent complaint", await call_("addComment", S, { id: ghost, body: "ghost" }), "addComment");
  bad("missing-entity", "upvote a nonexistent complaint", await call_("toggleUpvote", S, { id: ghost }), "toggleUpvote");
  bad("missing-entity", "block a nonexistent complaint", await call_("markBlocked", T, { id: ghost, reason: "ghost reason", until: "2030-01-01" }), "markBlocked");
  bad("missing-entity", "escalate a nonexistent complaint", await call_("escalateComplaint", W, { id: ghost }), "escalateComplaint");
  bad("missing-entity", "read a nonexistent complaint", await call_("getComplaint", S, { id: ghost }), "getComplaint");
}

// --- D. Handoff to a target that is not staff ------------------------------
{
  const id = await mk(S);
  await call_("claimComplaint", T, { id });
  const users = await call_("adminUsers", A, {});
  const victim = (users.result ?? []).find((u) => u.role === "student");
  const r = await call_("handoffComplaint", T, { id, toUserId: victim.id, reason: "give to a student" });
  bad("validation", "cannot hand a job to a student", r, `handoffComplaint -> ${victim.email}`);
  const bogus = await call_("handoffComplaint", T, { id, toUserId: "does-not-exist" });
  bad("validation", "cannot hand a job to a missing user", bogus, "handoffComplaint bogus id");
}

// --- E. Rate-and-close bypassing the transition flow -----------------------
{
  const id = await mk(S);
  // Still `submitted` — nobody has touched it.
  const r = await call_("rateComplaint", S, { id, rating: 5, note: "closing this myself" });
  check("flow-bypass", "rateComplaint cannot skip the flow from submitted", !!r.error,
    r.error ? `blocked: ${r.error}` : "ALLOWED — closed a submitted job");
}

// --- F. Assignment against a nonexistent complaint -------------------------
{
  const users = await call_("adminUsers", A, {});
  const staffer = (users.result ?? []).find((u) => u.role === "staff");
  const r = await call_("assignComplaint", W, { id: "GEC-H-1999-9999", assigneeId: staffer.id });

// --- G. Room id from a different hostel ------------------------------------
{
  const r = await call_("createComplaint", S, {
    hostelId: "BH1", roomLabel: "999", roomId: "GH1-301", floor: 3,
    category: "plumbing", title: "cross hostel room probe " + stamp,
    description: "room id belongs to a different hostel than the complaint",
  });

  const g = r.result?.id ? await call_("getComplaint", S, { id: r.result.id }) : null;
  const c = g?.result?.complaint;
  check("validation", "room from another hostel is not silently accepted",
    !c || c.roomId !== "GH1-301", c ? `stored roomId=${c.roomId} on hostel ${c.hostelId}` : `rejected: ${r.error}`);
}

// --- H. Input validation on free-text fields -------------------------------
{
  const id = await mk(S);
  bad("validation", "reject a 1001-char comment", await call_("addComment", S, { id, body: "x".repeat(1001) }), "addComment length");
  const okLen = await call_("addComment", S, { id, body: "y".repeat(1000) });
  check("validation", "accept a 1000-char comment", !okLen.error, okLen.error || "");
  bad("validation", "reject rating 0", await call_("rateComplaint", S, { id, rating: 0 }), "rateComplaint");
  bad("validation", "reject rating 6", await call_("rateComplaint", S, { id, rating: 6 }), "rateComplaint");
  bad("validation", "reject a 1-char title", await call_("createComplaint", S, {
    hostelId: "BH1", roomLabel: "204", category: "electrical", title: "x", description: "a valid description here",
  }), "createComplaint title");

  const noc = await call_("createComplaint", S, {
    roomLabel: "204", category: "electrical", title: "no hostel probe", description: "a valid description here",
  });

  check("validation", "reject a complaint with no hostel", !!noc.error, noc.error || "ALLOWED");
}

// --- I. Notice scoping -----------------------------------------------------
{
  const n = await call_("createNotice", W, { title: "GH1 only notice", body: "girls hostel water", hostelId: "GH1" });
  check("validation", "warden notice scoped to another hostel is refused", !!n.error, n.error || "ALLOWED");
}


// --- J. "Still broken" must actually reopen the repair ---------------------
// Mirrors reportStillBroken() in complaints.$id.tsx: transition to reopened
// first, then post the public signal.
{
  const id = await mk(S);
  await call_("claimComplaint", T, { id });
  await call_("transitionComplaint", T, { id, to: "in_progress" });
  await call_("transitionComplaint", T, { id, to: "resolved" });
  const reopen = await call_("transitionComplaint", S, { id, to: "reopened", remark: "Resident reported it is still broken" });
  check("still-broken", "the reopen step itself is allowed for the reporter", !reopen.error, reopen.error || "");
  await call_("addComment", S, { id, body: "The fan still does not start", kind: "signal" });
  const g = await call_("getComplaint", S, { id });
  check("still-broken", "reporting a still-broken repair reopens it",
    g.result?.complaint?.status === "reopened", `status stayed ${g.result?.complaint?.status}`);
  const bd = await call_("hostelBoard", S, {});
  check("still-broken", "a still-broken repair leaves the repaired list",
    !bd.result?.repaired?.some((x) => x.id === id), "still shown as repaired");
  check("still-broken", "a still-broken repair shows on the open board",
    !!bd.result?.unresolved?.some((x) => x.id === id), "missing from unresolved");
  check("still-broken", "a still-broken repair reaches the warden's disputed queue",
    !!bd.result?.disputed?.some((x) => x.id === id), "missing from disputed");
}

// ---- Photo endpoint authorisation ----------------------------------------
{
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const open = (mine.result ?? []).find((x) => !["closed", "resolved", "rejected"].includes(x.status));
  const target = open?.id ?? (await mk(S));
  const up = await call_("uploadPhoto", S, { complaintId: target, dataUrl: png, kind: "before" });

  if (up.result?.id) {
    const anonGet = await fetch(`${BASE}/api/photos/${up.result.id}`, { redirect: "manual" });
    const anonOk = anonGet.status === 401 || anonGet.status === 403;
    check("photo-auth", "photo endpoint refuses an anonymous request", anonOk,
      anonOk ? `refused with ${anonGet.status}` : `ALLOWED — returned ${anonGet.status} ${anonGet.headers.get("content-type") ?? ""}`);

    const bogus = await fetch(`${BASE}/api/photos/${up.result.id}`, {
      headers: { cookie: "better-auth.session_token=not-a-real-session" }, redirect: "manual",
    });

    const bogusOk = bogus.status === 401 || bogus.status === 403;
    check("photo-auth", "photo endpoint refuses a forged session", bogusOk,
      bogusOk ? `refused with ${bogus.status}` : `ALLOWED — returned ${bogus.status}`);
    // The reporter must still be able to see their own photo.
    const own = await fetch(`${BASE}/api/photos/${up.result.id}`, { headers: { cookie: S }, redirect: "manual" });
    check("photo-auth", "the reporter can still read their own photo", own.status === 200,
      `expected 200, got ${own.status}`);
  } else {
    check("photo-auth", "photo endpoint refuses an anonymous request", false, `upload failed: ${up.error}`);
  }
}

console.table(results);
const fails = results.filter((r) => r.result === "FAIL");
console.log(`\n${results.length - fails.length}/${results.length} passed, ${fails.length} failed`);

if (fails.length) {
  console.log("\nFAILURES:");
  fails.forEach((f) => console.log(` [${f.role}] ${f.step} :: ${f.detail}`));
}

process.exit(fails.length ? 1 : 0);

  check("missing-entity", "assign on a nonexistent complaint is refused", !!r.error,
    r.error ? `blocked: ${r.error}` : "ALLOWED — wrote to a missing row");
}

