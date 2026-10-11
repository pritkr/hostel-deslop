import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Check, ChevronLeft, FileText, Lock, MapPin, Send, ThumbsUp, TriangleAlert } from "lucide-react";
import { getSession } from "../lib/auth-functions";
import { getComplaint } from "../lib/complaint-get";
import { addComment, toggleUpvote, transitionComplaint } from "../lib/complaint-actions";
import { claimComplaint, escalateComplaint, handoffComplaint } from "../lib/shift-actions";
import { PhotoUploader } from "../components/PhotoUploader";
import { AppShell } from "../components/AppShell";
import { statusChip } from "../components/bulletin-ui";
import { tapFeedback, useToast } from "../components/motion";
import { ageLabel, catStyle, daysCount, dueLabel, hostelName, ownerLabel } from "../utils/bulletin";
import { isComplaintStatus, nextForwardStep, type ComplaintStatus } from "#/lib/complaint-policy";

export const Route = createFileRoute("/complaints/$id")({
  beforeLoad: async () => {
    const s = await getSession();

    if (!s) throw redirect({ to: "/login" });

    return { me: s.user };
  },
  loader: async ({ params }) => getComplaint({ data: { id: params.id } }),
  component: RepairDetail,
});

type Event = { id: string; fromStatus?: string | null; toStatus?: string | null; remark?: string | null; actorName?: string | null; actorRole?: string | null; createdAt: number };

/**
 * Resident-readable wording for each status.
 *
 * Keyed by the closed status set plus `blocked`, which is a timeline-only state
 * rather than a complaint status. An unrecognised status falls back to the raw
 * value so a newly added state is visible rather than blank.
 */
const LABEL = {
  submitted: "Reported",
  acknowledged: "Assigned",
  in_progress: "Work started",
  resolved: "Marked fixed",
  closed: "Confirmed by resident",
  reopened: "Reopened — still broken",
  rejected: "Out of scope",
  blocked: "Blocked",
} as const satisfies Record<ComplaintStatus | "blocked", string>;

function statusLabel(status: string): string {
  return isComplaintStatus(status) ? LABEL[status] : status;
}

function Timeline({ events, due }: { events: Event[]; due: string }) {
  const rows = [...events].reverse();

  return (
    <ol className="mt-2 space-y-3">
      {rows.map((e, i) => {
        const last = i === rows.length - 1;

        return (
          <li key={e.id} className="relative flex gap-3 pl-1">
            <span className="relative flex flex-col items-center">
              <span className={`z-10 mt-1 h-2.5 w-2.5 rounded-full ${e.toStatus === "resolved" || e.toStatus === "closed" ? "bg-[#1a7f4b]" : "bg-[#0f4c3a]"}`} />
              {!last && <span className="w-px flex-1 bg-slate-200" />}
            </span>
            <span className="min-w-0 flex-1 pb-1">
              <span className="block text-[12.5px] font-extrabold text-slate-800">
                {e.remark && e.remark.length < 60 ? e.remark : e.toStatus ? statusLabel(e.toStatus) : "Update"}
              </span>
              {e.remark && e.remark.length >= 60 && <span className="mt-0.5 block text-[11.5px] leading-relaxed text-slate-600">{e.remark}</span>}
              <span className="mt-0.5 block text-[11px] text-slate-400">
                {e.actorName ? `${e.actorName} · ` : ""}{ageLabel(e.createdAt)}
              </span>
            </span>
          </li>
        );
      })}
      <li className="flex gap-3 pl-1">
        <span className="mt-1 h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span>
          <span className="block text-[12.5px] font-extrabold text-slate-500">Next update</span>
          <span className="block text-[11px] text-slate-400">{due}</span>
        </span>
      </li>
    </ol>
  );
}


function RepairDetail() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const toast = useToast();
  const c = data.complaint;
  const events = data.timeline;
  const msgs = data.comments;
  const photos = data.photos;
  const staffish = data.staffish;
  const isMine = c.assigneeId === data.me.id;
  const cat = catStyle(c.category);
  const [busy, setBusy] = useState("");
  const [body, setBody] = useState("");
  const [priv, setPriv] = useState(false);
  const [shown, setShown] = useState(msgs);
  const [votes, setVotes] = useState(c.upvotes ?? 0);
  const [err, setErr] = useState("");
  const [quoting, setQuoting] = useState<"" | "broken" | "wrong">("");

  const latest = events[0];

  // The forward step a resident is offered next. The server re-validates this
  // against the lifecycle in complaint-policy, so a stale value here fails
  // closed rather than writing an illegal transition.
  const stepLabel: Record<"acknowledged" | "in_progress" | "resolved", string> = {
    acknowledged: "Acknowledge",
    in_progress: "Start work",
    resolved: "Mark work done",
  };

  const nextStep = nextForwardStep(c.status);
  const nextStepLabel = nextStep ? stepLabel[nextStep] : null;

  /**
   * Runs a mutation, reports the outcome as a toast, and refetches this route.
   *
   * The result is deliberately discarded: every action on this screen
   * communicates through the refetched loader. The one action that does need its
   * result (upvoting) reads it directly rather than through here.
   */
  async function run<TResult>(
    kind: string,
    fn: () => Promise<TResult>,
    ok: string,
    detail?: string,
    tone: "ok" | "info" | "warn" = "ok",
  ) {
    setBusy(kind);
    setErr("");

    try {
      await fn();
      toast.push({ title: ok, detail, tone });
      // Refetch this route's loader instead of a full reload: the page keeps
      // its scroll position, its draft, and its animation state.
      await router.invalidate();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "That did not save — try again";
      setErr(msg);
      toast.push({ title: "Could not save", detail: msg, tone: "warn" });
    } finally {
      setBusy("");
    }
  }

  /**
   * "Still broken" is a status change, not a comment. The resident is telling
   * us the work did not hold, so the repair has to go back to `reopened`: out of
   * the "Recently repaired" list, back onto the warden's disputed queue, and into
   * the flow again. Posting the signal alone left a broken fault showing a green
   * tick, which is the opposite of what the button promises.
   */
  async function reportStillBroken(text: string) {
    const t = text.trim();

    if (t.length < 2) return;
    setBusy("post");
    setErr("");

    try {
      if (c.status === "resolved" || c.status === "closed") {
        await transitionComplaint({ data: { id: c.id, to: "reopened", remark: "Resident reported it is still broken" } });
      }

      await addComment({ data: { id: c.id, body: t, visibility: "public", kind: "signal" } });
      setShown((p) => [
        { id: `local-${Date.now()}`, body: t, visibility: "public", kind: "signal", authorName: data.me.name, isMine: true, createdAt: Date.now() },
        ...p,
      ]);
      setBody("");
      setQuoting("");
      toast.push({ title: "Sent — the repair is open again", detail: "Staff have been notified it is not fixed." });
      await router.invalidate();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not send";
      setErr(msg);
      toast.push({ title: "Could not send", detail: msg, tone: "warn" });
    } finally {
      setBusy("");
    }
  }

  async function post(text: string, signal: "message" | "signal" = "message", visibility: "public" | "staff" = priv ? "staff" : "public") {
    const t = text.trim();

    if (t.length < 2) return;
    setBusy("post");

    try {
      await addComment({ data: { id: c.id, body: t, visibility, kind: signal } });
      // The message appears instantly; the loader confirms it a moment later.
      setShown((p) => [
        { id: `local-${Date.now()}`, body: t, visibility, kind: signal, authorName: data.me.name, isMine: true, createdAt: Date.now() },
        ...p,
      ]);
      setBody("");
      setQuoting("");
      router.invalidate();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not post";
      setErr(msg);
      toast.push({ title: "Message not sent", detail: msg, tone: "warn" });
    } finally {
      setBusy("");
    }
  }

  return (
    <AppShell>
      <div className="flex items-center gap-2 px-1">
        <Link to="/bulletin" className="grid h-8 w-8 place-items-center rounded-full bg-white ring-1 ring-slate-900/10">
          <ChevronLeft size={16} />
        </Link>
        <p className="text-[12px] font-bold text-slate-500">Repair detail</p>
        {c.confidential && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-slate-200 px-2 py-1 text-[10.5px] font-extrabold text-slate-600">
            <Lock size={11} /> Private to staff
          </span>
        )}
      </div>

      <div className="mt-2 rounded-[18px] bg-white px-3 py-3 ring-1 ring-slate-900/[0.06]">
        <div className="flex items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${cat.bg} ${cat.fg}`}>{cat.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[15.5px] font-extrabold leading-tight text-slate-900">{c.title}</p>
            <p className="mt-1 flex items-center gap-1 text-[11.5px] text-slate-500">
              <MapPin size={12} className="text-[#0f4c3a]" /> {c.roomLabel ? `${c.roomLabel} · ` : ""}{hostelName(c.hostelId)}
            </p>
            <p className="mt-0.5 text-[11.5px] text-slate-500">
              {isMine ? "Held by you" : ownerLabel(c)} · {daysCount(c.createdAt)} day{daysCount(c.createdAt) > 1 ? "s" : ""} old
            </p>
          </div>
          {statusChip(c.status, c.overdue)}
        </div>
        {isMine && (
          <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-[#e6f4ec] px-3 py-2 text-[11.5px] font-bold text-[#0f4c3a]">
            <Check size={13} strokeWidth={3} /> This job is in your name — the next update is yours to give.
          </p>
        )}
        <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-600">{c.description}</p>
        <p className="mt-1.5 text-[11px] text-slate-400">
          Raised by {c.studentName ?? "resident"} · {ageLabel(c.createdAt)} · {dueLabel(c.slaDueAt, c.overdue)}
        </p>
      </div>

      {photos.length > 0 && (
        <div className="mt-2.5 rounded-[18px] bg-white px-3 py-3 ring-1 ring-slate-900/[0.06]">
          <p className="text-[12px] font-extrabold text-slate-700">Photos</p>
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
            {photos.map((p) => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="shrink-0">
                <img src={p.url} alt={p.kind === "after" ? "After work" : "Reported fault"} className="h-24 w-24 rounded-xl object-cover ring-1 ring-slate-900/10" />
                <span className="mt-1 block text-center text-[10px] font-bold text-slate-400">{p.kind === "after" ? "After work" : "Reported"}</span>
              </a>
            ))}
          </div>
          <p className="mt-1 text-[10.5px] text-slate-400">
            Visible to the reporter and authorised staff only — never shown on the public bulletin.
          </p>
        </div>
      )}

      <div className="mt-2.5 rounded-[18px] bg-white px-3 py-3 ring-1 ring-slate-900/[0.06]">
        <p className="flex items-center gap-1.5 text-[12px] font-extrabold text-slate-800">
          <FileText size={13} className="text-[#0f4c3a]" />
          {latest?.actorName ? `Update from ${latest.actorName}` : "No update yet"}
        </p>
        <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-900/[0.05]">
          <p className="text-[12.5px] leading-relaxed text-slate-700">
            {latest?.remark ?? "Awaiting acknowledgement by the responsible staff."}
          </p>
          <p className="mt-1 text-[10.5px] font-semibold text-slate-400">{latest ? `${ageLabel(latest.createdAt)} ago` : "waiting"}</p>
        </div>
        <p className="mt-3 text-[12px] font-extrabold text-slate-700">The repair story</p>
        <Timeline events={events} due={dueLabel(c.slaDueAt, c.overdue)} />
      </div>

      <div className="mt-2.5 rounded-[18px] bg-white px-3 py-3 ring-1 ring-slate-900/[0.06]">
        <p className="text-[12px] font-extrabold text-slate-700">Issue thread</p>
        <p className="mt-0.5 text-[10.5px] text-slate-400">
          {staffish ? "You also see private-to-staff messages." : "Ordinary messages are visible to your hostel."}
        </p>
        <div className="mt-3 space-y-2">
          {shown.length === 0 && (
            <p className="pop-in rounded-xl bg-slate-50 px-3 py-3 text-[12px] text-slate-500">
              No messages yet. Anything written here stays with this fault.
            </p>
          )}
          {[...shown].reverse().map((m, i) => {
            // Your own words sit on the right; everyone else's on the left.
            const mine = m.isMine;

            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
                style={{ animation: "rise-in var(--dur-4) var(--ease-out) both", animationDelay: `${Math.min(i, 6) * 40}ms` }}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                    m.visibility === "staff"
                      ? "bg-[#fdf7e3] ring-1 ring-[#f0dfa8]"
                      : mine
                        ? "bg-[#0f4c3a] text-white"
                        : "bg-slate-50 text-slate-800"
                  }`}
                >
                  <p className={`flex flex-wrap items-center gap-1.5 text-[10.5px] font-extrabold ${mine ? "text-white/70" : "text-slate-500"}`}>
                    {mine ? "You" : (m.authorName ?? "Someone")}
                    {m.visibility === "staff" && (
                      <span className="flex items-center gap-1 text-[9.5px] font-bold text-[#8a5a12]">
                        <Lock size={9} /> private
                      </span>
                    )}
                    {m.kind === "signal" && (
                      <span className="rounded-full bg-[#fde2e2] px-1.5 py-[1px] text-[9.5px] font-extrabold text-[#b3261e]">
                        signal
                      </span>
                    )}
                    <span className={mine ? "text-white/60" : "text-slate-400"}>
                      · {new Date(m.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed">{m.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        {quoting !== "" ? (
          <div className="mt-3 rounded-xl bg-[#fdecec] px-3 py-2.5 ring-1 ring-[#f6c6c4]">
            <p className="text-[11.5px] font-extrabold text-[#b3261e]">
              {quoting === "broken" ? "Still broken — tell us what is left" : "Record is wrong — what should it say?"}
            </p>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              className="mt-1.5 w-full rounded-lg bg-white px-3 py-2 text-[16px] outline-none ring-1 ring-slate-900/10"
              placeholder={quoting === "broken" ? "The fan still does not start on speed 1…" : "Wrong location — it is the second-floor bathroom…"}
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                disabled={busy === "post" || body.trim().length < 2}
                onPointerDown={() => tapFeedback(12)}
                onClick={() => (quoting === "broken" ? reportStillBroken(body) : post(body, "signal"))}
                className="pressable rounded-lg bg-[#0f4c3a] px-4 py-2 text-[11.5px] font-extrabold text-white disabled:opacity-60"
              >
                {busy === "post"
                  ? "Sending…"
                  : quoting === "broken"
                    ? "Reopen as still broken"
                    : "Send signal"}
              </button>
              <button
                onClick={() => {
                  setQuoting("");
                  setBody("");
                }}
                className="pressable px-1 text-[11.5px] font-bold text-slate-500"
              >
                Cancel
              </button>
              <span className="ml-auto text-[10.5px] text-slate-400">recorded on the timeline</span>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-3 flex items-end gap-2">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder={staffish ? "Post an update, delay reason or correction…" : "Ask a question or add detail…"}
                className="min-w-0 flex-1 rounded-xl bg-slate-50 px-3 py-2.5 text-[16px] outline-none ring-1 ring-slate-900/[0.08] focus:bg-white"
              />
              <button
                disabled={busy === "post" || body.trim().length < 2}
                onPointerDown={() => tapFeedback(12)}
                onClick={() => post(body)}
                className="pressable-strong grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#0f4c3a] text-white disabled:opacity-50"
              >
                <Send size={16} />
              </button>
            </div>
            <label className="mt-2.5 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11.5px] font-bold text-slate-500">
              <input
                type="checkbox"
                checked={priv}
                onChange={(e) => setPriv(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#0f4c3a]"
              />
              Private to staff — keep sensitive specifics out of the shared feed
            </label>
          </>
        )}
      </div>

      {staffish && (
        <div className="mt-2.5">
          <PhotoUploader
            complaintId={c.id}
            kind="after"
            onDone={() => {
              toast.push({ title: "Photo added", detail: "It is attached to this repair." });
              router.invalidate();
            }}
          />
        </div>
      )}

      {err && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">{err}</p>}

      <div className="fixed bottom-[62px] left-1/2 z-30 w-full max-w-[430px] -translate-x-1/2 border-t border-slate-900/10 bg-[#fdf8ee]/95 px-3 py-2 backdrop-blur">
        <div className="grid grid-cols-2 gap-2">
          {data.isReporter && (c.status === "resolved" || c.status === "closed") ? (
            <button
              disabled={busy !== ""}
              onClick={() => run("close", () => transitionComplaint({ data: { id: c.id, to: "closed", remark: "Resident confirmed the repair" } }), "Repair confirmed", "Thanks — it is now marked as done.")}
              className="pressable rounded-xl bg-[#0f4c3a] py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50"
            >
              {busy === "close" ? "Saving…" : "Confirm fixed"}
            </button>
          ) : staffish && !c.assigneeId ? (
            <button
              disabled={busy !== ""}
              onPointerDown={() => tapFeedback(12)}
              onClick={() => run("claim", () => claimComplaint({ data: { id: c.id } }), "Job accepted", "It is in your name and on the slate.")}
              className="pressable rounded-xl bg-[#0f4c3a] py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50"
            >
              {busy === "claim" ? "Accepting…" : "Accept this job"}
            </button>
          ) : staffish && nextStep ? (
            <button
              disabled={busy !== ""}
              onPointerDown={() => tapFeedback(12)}
              onClick={() => run("step", () => transitionComplaint({ data: { id: c.id, to: nextStep, remark: nextStepLabel ?? undefined } }), (nextStepLabel ?? "Step") + " — saved")}
              className="pressable rounded-xl bg-[#0f4c3a] py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50"
            >
              {busy === "step" ? "Saving…" : nextStepLabel}
            </button>
          ) : (
            <button
              disabled={busy !== ""}
              onPointerDown={() => tapFeedback(8)}
              onClick={async () => {
                const r = await toggleUpvote({ data: { id: c.id } });
                setVotes((v) => Math.max(0, v + (r.upvoted ? 1 : -1)));
                toast.push({
                  title: r.upvoted ? "Marked as same issue" : "Vote removed",
                  detail: r.upvoted ? "This raises the item's priority for staff." : undefined,
                  tone: "info",
                });
              }}
              className="pressable flex items-center justify-center gap-1.5 rounded-xl bg-white py-2.5 text-[12.5px] font-extrabold text-[#1d4ed8] ring-1 ring-[#1d4ed8]/30 disabled:opacity-60"
            >
              <ThumbsUp size={14} /> Same issue {votes > 0 ? `(${votes})` : ""}
            </button>
          )}

          <button
            disabled={busy !== ""}
            onPointerDown={() => tapFeedback(8)}
            onClick={() => setQuoting("broken")}
            className="pressable flex items-center justify-center gap-1.5 rounded-xl bg-[#f2c14e] py-2.5 text-[12.5px] font-extrabold text-[#4a3208] disabled:opacity-60"
          >
            <TriangleAlert size={14} /> Still broken
          </button>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2">
          <button
            disabled={busy !== ""}
            onClick={() => setQuoting("wrong")}
            className="pressable rounded-xl bg-white py-2 text-[11.5px] font-bold text-slate-600 ring-1 ring-slate-900/10 disabled:opacity-60"
          >
            Record is wrong
          </button>
          {staffish ? (
            <>
              <button
                disabled={busy !== ""}
                onClick={() => run("hand", () => handoffComplaint({ data: { id: c.id, reason: "Shift change" } }), "Handed off", "It is back in the unassigned queue.")}
                className="pressable rounded-xl bg-white py-2 text-[11.5px] font-bold text-[#0f4c3a] ring-1 ring-[#0f4c3a]/30 disabled:opacity-50"
              >
                Hand off
              </button>
              <button
                disabled={busy !== ""}
                onClick={() => run("esc", () => escalateComplaint({ data: { id: c.id, reason: "No response within scope" } }), "Escalated", "The chief warden has been notified.", "warn")}
                className="pressable rounded-xl bg-white py-2 text-[11.5px] font-bold text-[#b3261e] ring-1 ring-[#b3261e]/30 disabled:opacity-50"
              >
                Escalate
              </button>
            </>
          ) : (
            <>
              <Link to="/contacts" className="rounded-xl bg-white py-2 text-center text-[11.5px] font-bold text-slate-600 ring-1 ring-slate-900/10">
                Call staff
              </Link>
              <Link to="/my" className="rounded-xl bg-white py-2 text-center text-[11.5px] font-bold text-slate-600 ring-1 ring-slate-900/10">
                My reports
              </Link>
            </>
          )}
        </div>
      </div>
      <div className="h-24" />
    </AppShell>
  );
}

