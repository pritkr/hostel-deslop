// Full interaction + flow QA across every user type. Run: node scripts/qa-full.mjs
import { BASE, call, check, results, FN, who, anon } from "./qa-lib.mjs";

const stamp = Date.now().toString().slice(-5);

const call_ = (name, cookie, payload) => call(FN[name], name, cookie, payload);

// Pass = the call succeeded AND the expected guard held.
const ok = (role, step, res, cond = true, extra = "") =>
  check(role, step, !res.error && cond, res.error || extra);

async function newComplaint(cookie, over = {}) {
  const r = await call_("createComplaint", cookie, {
    hostelId: "BH1", roomLabel: "204", category: "electrical",
    title: "QA fan not working " + stamp,
    description: "Ceiling fan does not start on any speed in room 204.",
    ...over,
  });

  return r.result?.id;
}

// ---------------------------------------------------------------- anonymous
{
  const r = await call_("hostelBoard", anon, {});
  check("anon", "hostelBoard blocked", !!r.error, r.error || "no auth guard!");

  const c = await call_("createComplaint", anon, {
    hostelId: "BH1", roomLabel: "1", category: "electrical",
    title: "anon attempt", description: "should not be allowed at all",
  });

  check("anon", "createComplaint blocked", !!c.error, c.error || "ALLOWED!");
  const p = await fetch(`${BASE}/bulletin`, { headers: { cookie: anon }, redirect: "manual" });
  check("anon", "/bulletin redirects to login", p.status === 307, `${p.status} -> ${p.headers.get("location")}`);
}

// ------------------------------------------------------------------ student
{
  const S = who.student;
  const id = await newComplaint(S);
  check("student", "file complaint", !!id, id || "no id");
  globalThis.__id = id;

  let r = await call_("getComplaint", S, { id });
  ok("student", "view own complaint", r, r.result?.complaint?.id === id);

  r = await call_("addComment", S, { id, body: "Fan is still dead this morning." });
  ok("student", "post public comment", r);
  r = await call_("addComment", S, { id, body: "Please do not call outside the room", visibility: "staff" });
  ok("student", "post staff-only comment", r);
  r = await call_("addComment", S, { id, body: "x" });
  check("student", "reject 1-char comment", !!r.error, r.error || "accepted 1 char");

  r = await call_("toggleUpvote", S, { id });
  ok("student", "upvote own complaint", r, r.result?.upvoted === true);
  r = await call_("toggleUpvote", S, { id });
  ok("student", "remove own upvote", r, r.result?.upvoted === false);

  for (const to of ["acknowledged", "in_progress", "resolved"]) {
    const t = await call_("transitionComplaint", S, { id, to });
    check("student", `cannot self-advance to ${to}`, !!t.error, t.error || "ALLOWED!");
  }

  r = await call_("claimComplaint", S, { id });
  check("student", "cannot claim job", !!r.error, r.error || "ALLOWED!");
  r = await call_("handoffComplaint", S, { id });
  check("student", "cannot hand off", !!r.error, r.error || "ALLOWED!");
  r = await call_("markBlocked", S, { id, reason: "waiting", until: "2030-01-01" });
  check("student", "cannot mark blocked", !!r.error, r.error || "ALLOWED!");
  r = await call_("escalateComplaint", S, { id, reason: "x" });
  check("student", "cannot escalate", !!r.error, r.error || "ALLOWED!");
  r = await call_("slaSweep", S, {});
  check("student", "cannot run SLA sweep", !!r.error, r.error || "ALLOWED!");
  r = await call_("adminStats", S, {});
  check("student", "cannot read admin stats", !!r.error, r.error || "ALLOWED!");
  r = await call_("staffList", S, {});
  check("student", "cannot list staff", !!r.error, r.error || "ALLOWED!");
  r = await call_("listComplaints", S, { scope: "hostel" });
  check("student", "cannot list whole hostel", !!r.error, r.error || "ALLOWED!");

  r = await call_("listComplaints", S, { scope: "mine", limit: 50 });
  ok("student", "list own reports", r, Array.isArray(r.result));
  r = await call_("staffDirectory", S, {});
  ok("student", "open staff directory", r, !!r.result?.onDuty);
  r = await call_("listRooms", S, { hostelId: "BH1" });
  ok("student", "load room picker", r, Array.isArray(r.result) && r.result.length > 0);
  r = await call_("listNotices", S, {});
  ok("student", "read notices", r, Array.isArray(r.result));


// -------------------------------------------------------------------- staff
{
  const T = who.staff, T2 = who.staff2;
  const id = globalThis.__id;

  let r = await call_("claimComplaint", T, { id });
  ok("staff", "accept unassigned job", r);

  r = await call_("claimComplaint", T2, { id });
  check("staff", "cannot steal an owned job", !!r.error, r.error || "ALLOWED!");

  r = await call_("transitionComplaint", T, { id, to: "in_progress", remark: "Opening the panel" });
  ok("staff", "advance to in_progress", r);
  r = await call_("transitionComplaint", T, { id, to: "resolved", remark: "Fan replaced" });
  ok("staff", "advance to resolved", r);
  r = await call_("transitionComplaint", T, { id, to: "resolved" });
  check("staff", "cannot re-resolve a resolved job", !!r.error, r.error || "ALLOWED!");
  r = await call_("transitionComplaint", T, { id, to: "rejected" });
  check("staff", "staff cannot reject", !!r.error, r.error || "ALLOWED!");

  r = await call_("markBlocked", T, { id, reason: "Awaiting 40W fuse", until: "2030-01-01" });
  ok("staff", "mark blocked with reason", r);
  r = await call_("markBlocked", T, { id, reason: "x", until: "2030-01-01" });
  check("staff", "reject too-short block reason", !!r.error, r.error || "accepted");

  r = await call_("handoffComplaint", T, { id, reason: "Shift change" });
  ok("staff", "hand off owned job", r);

  r = await call_("slaSweep", T, {});
  check("staff", "cannot run SLA sweep", !!r.error, r.error || "ALLOWED!");
  r = await call_("adminUsers", T, {});
  check("staff", "cannot list users", !!r.error, r.error || "ALLOWED!");
  r = await call_("createNotice", T, { title: "Staff notice", body: "should be blocked" });
  check("staff", "cannot post notice", !!r.error, r.error || "ALLOWED!");

  r = await call_("getComplaint", T, { id });
  const vis = (r.result?.comments ?? []).some((c) => c.visibility === "staff");
  check("staff", "sees staff-only comments", vis, vis ? "" : "staff comment hidden from staff");
}

// ------------------------------------------------------------------- warden
{
  const W = who.warden;
  const id = globalThis.__id;

  let r = await call_("createNotice", W, { title: "Water supply cut", body: "No water 10am-2pm in BH1." });
  ok("warden", "post notice", r);
  r = await call_("createNotice", W, { title: "ab", body: "x" });
  check("warden", "reject short notice", !!r.error, r.error || "accepted");
  r = await call_("createNotice", W, { title: "Other hostel", body: "should be blocked", hostelId: "GH1" });
  check("warden", "cannot post to another hostel", !!r.error, r.error || "ALLOWED!");

  r = await call_("slaSweep", W, {});

// -------------------------------------------------------------------- admin
{
  const A = who.admin;
  let r = await call_("adminStats", A, {});
  ok("admin", "read analytics", r, r.result?.total !== undefined);
  r = await call_("adminUsers", A, {});
  ok("admin", "list users", r, Array.isArray(r.result) && r.result.length > 0);

  const target = (r.result ?? []).find((u) => u.email === "student@gec.edu");
  r = await call_("adminSetRole", A, { userId: target.id, role: "warden", hostelId: "BH1" });
  ok("admin", "promote a user", r);
  r = await call_("adminSetRole", A, { userId: target.id, role: "student", hostelId: "BH1" });
  ok("admin", "demote back to student", r);
  r = await call_("adminSetRole", A, { userId: target.id, role: "superuser" });
  check("admin", "reject invalid role", !!r.error, r.error || "accepted");

  r = await call_("adminCreateStaff", A, {
    name: "QA Temp", email: `qa${stamp}@gec.edu`, password: "qapassword123", role: "staff", hostelId: "BH1",
  });
  ok("admin", "create staff login", r);
}

// --------------------------------------------------- lifecycle + privacy
{
  const S = who.student, T = who.staff, W = who.warden, A = who.admin;
  const id = await newComplaint(S, { confidential: true });
  check("privacy", "confidential complaint created", !!id, id || "no id");

  let r = await call_("getComplaint", T, { id });
  check("privacy", "confidential hidden from other staff", !!r.error, r.error || "LEAKED");
  r = await call_("getComplaint", W, { id });
  ok("privacy", "confidential visible to own-hostel warden", r);
  r = await call_("getComplaint", S, { id });
  ok("privacy", "confidential visible to reporter", r);
  r = await call_("getComplaint", A, { id });
  ok("privacy", "confidential visible to admin", r);

  r = await call_("claimComplaint", T, { id }); ok("lifecycle", "claim", r);
  r = await call_("transitionComplaint", T, { id, to: "in_progress" }); ok("lifecycle", "in_progress", r);
  r = await call_("transitionComplaint", T, { id, to: "resolved" }); ok("lifecycle", "resolved", r);

  r = await call_("transitionComplaint", T, { id, to: "closed" });
  check("lifecycle", "staff cannot close", !!r.error, r.error || "ALLOWED!");
  r = await call_("transitionComplaint", S, { id, to: "closed" });
  ok("lifecycle", "reporter confirms repair", r);
  r = await call_("transitionComplaint", S, { id, to: "reopened" });
  ok("lifecycle", "reporter reopens a closed repair", r);

  r = await call_("hostelBoard", S, {});
  const still = (r.result?.repaired ?? []).some((x) => x.id === id);
  check("lifecycle", "reopened item leaves repaired list", !still, still ? "still listed as repaired" : "");

  r = await call_("transitionComplaint", W, { id, to: "closed" });
  check("lifecycle", "cannot jump reopened -> closed", !!r.error, r.error || "ALLOWED!");
}

  ok("warden", "run SLA sweep", r);
  r = await call_("escalateComplaint", W, { id, reason: "no progress" });
  ok("warden", "escalate to chief warden", r);
  r = await call_("hostelBoard", W, { hostelId: "GH1" });
  check("warden", "cannot read another hostel board", !!r.error, r.error || "ALLOWED!");
  r = await call_("adminStats", W, {});
  check("warden", "cannot read admin stats", !!r.error, r.error || "ALLOWED!");
  r = await call_("adminSetRole", W, { userId: "x", role: "admin" });
  check("warden", "cannot set roles", !!r.error, r.error || "ALLOWED!");
  r = await call_("adminCreateStaff", W, { name: "X", email: "x@gec.edu", password: "password123", role: "staff" });
  check("warden", "cannot create staff", !!r.error, r.error || "ALLOWED!");
}

  r = await call_("createComplaint", S, {
    hostelId: "BH1", roomLabel: "204", category: "electrical", title: "ab", description: "long enough description here",
  });
  check("student", "reject short title", !!r.error, r.error || "accepted");
  r = await call_("createComplaint", S, {
    hostelId: "BH1", roomLabel: "204", category: "electrical", title: "Valid title here", description: "short",
  });
  check("student", "reject short description", !!r.error, r.error || "accepted");
  r = await call_("createComplaint", S, {
    hostelId: "BH1", roomLabel: "204", category: "electrical",
    title: "x".repeat(200), description: "long enough description here",
  });
  check("student", "reject overlong title", !!r.error, r.error || "accepted");
}

// ------------------------------------------------- cross-tenant containment
// Regression cover for the hostel boundary. A student belongs to one building,
// and the bulletin only offers the hostel switcher to staff/warden/admin, so a
// student reading another building's board is a break rather than a feature.
// These paths were reachable by passing another hostelId to the server
// functions directly.
{
  const S = who.student; // BH1
  let r = await call_("hostelBoard", S, { hostelId: "GH1" });
  check("isolation", "student cannot read another hostel board", !!r.error, r.error || "ALLOWED!");

  const other = await call_("createComplaint", who.staff, {
    hostelId: "GH1", roomLabel: "303", category: "plumbing",
    title: "GH1 isolation probe " + stamp,
    description: "Sink overflows in 303, filed to verify the hostel boundary holds.",
  });

  const oid = other.result?.id;

  if (oid) {
    r = await call_("getComplaint", S, { id: oid });
    check("isolation", "student cannot open another hostel complaint", !!r.error, r.error || "ALLOWED!");
    r = await call_("listPhotos", S, { complaintId: oid });
    check("isolation", "student cannot list another hostel photos", !!r.error, r.error || "ALLOWED!");
    r = await call_("addComment", S, { id: oid, body: "should not land" });
    check("isolation", "student cannot comment on another hostel item", !!r.error, r.error || "ALLOWED!");
    r = await call_("toggleUpvote", S, { id: oid });
    check("isolation", "student cannot upvote another hostel item", !!r.error, r.error || "ALLOWED!");
  } else {
    check("isolation", "cross-hostel probe complaint created", false, other.error || "no id");
  }

  r = await call_("listRooms", S, { hostelId: "GH1" });
  check("isolation", "student cannot list another hostel rooms", !!r.error, r.error || "ALLOWED!");

  // The same reads must still work inside the caller's own building, otherwise
  // the fix above would just be breaking the app.
  r = await call_("hostelBoard", S, { hostelId: "BH1" });
  check("isolation", "student can still read own hostel board", !r.error, r.error || "blocked!");
  r = await call_("listRooms", S, { hostelId: "BH1" });
  check("isolation", "student can still list own hostel rooms", !r.error, r.error || "blocked!");
  r = await call_("listRooms", who.admin, { hostelId: "GH1" });
  check("isolation", "admin keeps campus-wide room access", !r.error, r.error || "blocked!");
}

// -------------------------------------------- confidential write containment
// Reading a confidential report is guarded, but these two paths are writes that
// had no guard at all: any session could upvote a report it may not open, and
// could enumerate the photos attached to it.
{
  const S = who.student;

  const conf = await call_("createComplaint", S, {
    hostelId: "BH1", roomLabel: "204", category: "electrical",
    title: "Confidential isolation probe " + stamp,
    description: "Private personal matter, must stay hidden from other residents.",
    confidential: true,
  });

  const cid = conf.result?.id;

  if (!cid) {
    check("isolation", "confidential probe created", false, conf.error || "no id");
  } else {
    let r = await call_("toggleUpvote", who.staff, { id: cid });
    check("isolation", "unrelated staff cannot upvote confidential", !!r.error, r.error || "ALLOWED!");
    r = await call_("listPhotos", who.staff, { complaintId: cid });
    check("isolation", "unrelated staff cannot list confidential photos", !!r.error, r.error || "ALLOWED!");
    r = await call_("addComment", who.staff, { id: cid, body: "should not land" });
    check("isolation", "unrelated staff cannot comment on confidential", !!r.error, r.error || "ALLOWED!");
    r = await call_("toggleUpvote", S, { id: cid });
    check("isolation", "reporter can still upvote own confidential", !r.error, r.error || "blocked!");
  }
}

// ------------------------------------------------- register number integrity
// The sequence was read-then-written without a guard, so simultaneous filings
// computed the same id and every loser lost its complaint to a primary-key
// error. Parallel filings must all succeed with distinct register numbers.
{
  const burst = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      call_("createComplaint", who.staff, {
        hostelId: "BH1", roomLabel: "204", category: "electrical",
        title: `Concurrency probe ${i} ${stamp}`,
        description: "Parallel filing to verify unique register numbers.",
      }),
    ),
  );

  const ids = burst.map((b) => b.result?.id).filter(Boolean);
  check("integrity", "parallel filings all succeed", ids.length === burst.length,
    `${ids.length}/${burst.length} ok; first error: ${burst.find((b) => b.error)?.error || "none"}`);
  check("integrity", "parallel filings get unique ids", new Set(ids).size === ids.length,
    `${new Set(ids).size} unique of ${ids.length}`);
}

// ------------------------------------------------------ transport hardening
{
  const p = await fetch(`${BASE}/login`, { redirect: "manual" });
  const h = p.headers;
  const csp = h.get("content-security-policy") || "";
  check("hardening", "CSP header present", !!csp, csp || "missing");
  check("hardening", "frame-ancestors blocks clickjacking", csp.includes("frame-ancestors 'none'"), "no frame-ancestors");
  check("hardening", "nosniff present", h.get("x-content-type-options") === "nosniff", h.get("x-content-type-options") || "missing");
  check("hardening", "X-Frame-Options present", !!h.get("x-frame-options"), h.get("x-frame-options") || "missing");
  check("hardening", "Referrer-Policy present", !!h.get("referrer-policy"), h.get("referrer-policy") || "missing");
}

// The report is emitted last so that every block above — including the
// isolation and integrity probes appended after the warden cases — is counted.
console.table(results);

const fails = results.filter((r) => r.result === "FAIL");

console.log(`\n${results.length - fails.length}/${results.length} passed, ${fails.length} failed`);

if (fails.length) {
  console.log("\nFAILURES:");
  fails.forEach((f) => console.log(` [${f.role}] ${f.step} :: ${f.detail}`));
}

process.exit(fails.length ? 1 : 0);

