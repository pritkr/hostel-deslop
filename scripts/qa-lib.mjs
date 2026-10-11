// Live QA harness for gec-hostel. Exercises the real server functions for
// every role, not just page status codes.
//
// This is a plain `.mjs` script driven by `fetch`, not part of the TypeScript
// app, so it inspects wire payloads with explicit shape predicates instead of a
// schema. The two helpers below are the only places that touch a raw response
// body, and each states the envelope it expects.
const BASE = "http://localhost:3000";

/** True when `value` is a non-null object, i.e. something a property can be read off. */
function isRecord(value) {
  return Object(value) === value;
}

async function login(email, password) {
  const r = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });

  const sc = r.headers.getSetCookie?.() ?? [];

  return sc.map((c) => c.split(";")[0]).join("; ");
}

// Map exportName -> serverFn id, harvested from the Vite transform output.
async function loadFns() {
  const files = [
    "src/lib/shift-actions.ts", "src/lib/complaint-actions.ts", "src/lib/complaint-create.ts",
    "src/lib/complaint-get.ts", "src/lib/complaint-list.ts", "src/lib/board-functions.ts",
    "src/lib/notice-functions.ts", "src/lib/directory-functions.ts", "src/lib/rooms-functions.ts",
    "src/lib/admin-functions.ts", "src/lib/complaint-admin.ts", "src/lib/photo-functions.ts",
  ];

  const map = {};

  for (const f of files) {
    const src = await (await fetch(`${BASE}/${f}`)).text();
    const re = /createServerFn\(\{ method: "(\w+)" \}\)\.handler\(createClientRpc\("([^"]+)"\)\)/g;
    let m;
    const method = {};

    while ((m = re.exec(src))) method[m[2]] = m[1];
    // export order maps 1:1 onto the declaration order in the source file.
    const names = [...src.matchAll(/export const (\w+) = createServerFn/g)].map((x) => x[1]);
    const ids = Object.keys(method);
    names.forEach((n, i) => { if (ids[i]) map[n] = { id: ids[i], method: method[ids[i]] }; });
  }

  return map;
}

import { toJSONAsync, fromJSON, fromCrossJSON } from "seroval";
import { defaultSerovalDeserializerPlugins } from "@tanstack/router-core/ssr/server";

// Seroval's JSON codec, used exactly as the framework uses it.
//
// Requests are encoded with toJSONAsync and decoded server-side with fromJSON.
// Responses come back as bare cross-JSON nodes that only decode with the
// router's own deserializer plugins (they carry TSR/Error nodes, which plain
// fromJSON cannot read) — hence fromCrossJSON on the way back.
const codec = { plugins: {} };

// The wire payload is { data } in both directions: query string for GET, JSON
// body for POST. Confirmed against the running server — a `payload` wrapper
// decodes to undefined and the validator then throws.
const encodePayload = (data) => toJSONAsync({ data: data ?? {} });

// Response envelope is { result, error, context }.
function unwrap(body) {
  let decoded = body;

  // A seroval-serialised body is tagged with `t`; the tag is what distinguishes
  // it from an already-plain JSON payload.
  if (isRecord(body) && "t" in body) {
    try {
      decoded = fromCrossJSON(body, { plugins: defaultSerovalDeserializerPlugins });
    } catch {
      try { decoded = fromJSON(body, codec); } catch { decoded = body; }
    }
  }

  if (isRecord(decoded) && "result" in decoded) {
    const { result, error } = decoded;

    return { result, error: error ? String(error?.message ?? error) : undefined };
  }

  return { result: decoded, error: undefined };
}

function errText(body) {
  return unwrap(body).error ?? "";
}

async function call(fn, name, cookie, payload) {
  // Mirror the real client transport: the serverFn's declared method is the HTTP
  // verb, and the seroval-encoded { data } payload travels in the query string
  // for GET and in the body for POST.
  const method = (fn?.method ?? "POST").toUpperCase();
  const headers = { origin: BASE, cookie, "x-tsr-serverFn": "true" };
  let url = `${BASE}/_serverFn/${fn.id}`;
  const init = { method, headers, redirect: "manual" };
  const wire = JSON.stringify(await encodePayload(payload));

  if (method === "GET") {
    url += `?payload=${encodeURIComponent(wire)}`;
  } else {
    headers["content-type"] = "application/json";
    init.body = wire;
  }

  const r = await fetch(url, init);
  const text = await r.text();
  let parsed = text;

  try { parsed = JSON.parse(text); } catch { /* keep raw text */ }

  const u = unwrap(parsed);

  return { status: r.status, body: parsed, result: u.result, error: u.error };
}

const results = [];

function check(role, step, pass, detail = "") {
  results.push({ role, step, result: pass ? "PASS" : "FAIL", detail: String(detail).slice(0, 90) });
}

const FN = await loadFns();

const who = {
  student: await login("student@gec.edu", "student123"),
  staff: await login("gaurav@gec.edu", "staff12345"),
  staff2: await login("kanhaiya@gec.edu", "staff12345"),
  warden: await login("kamal@gec.edu", "warden12345"),
  admin: await login("chitranjan@gec.edu", "admin12345"),
};

const anon = "";

export { BASE, login, loadFns, call, check, results, FN, who, anon, unwrap, errText };
