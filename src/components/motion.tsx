import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { AlertTriangle, Check, Info, X } from "lucide-react";
import { cn } from "../utils/format";

/* ── Reduced motion ───────────────────────────────────────────────────────
   Read from the media query rather than guessed, and kept live so a user
   toggling the OS setting mid-session is respected immediately. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);

    return () => mq.removeEventListener("change", on);
  }, []);

  return reduced;
}

/** Fires a short haptic tick where the platform allows it. */
export function tapFeedback(pattern: number | number[] = 8) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* haptics are a nicety, never a requirement */
  }
}

/* ── Presence ─────────────────────────────────────────────────────────────
   An exit animation needs the element to outlive its state by exactly as long
   as the animation runs. This keeps it mounted for that window, then drops it. */
export function usePresence(open: boolean, exitMs = 200) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);

      return;
    }

    setClosing(true);

    const t = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, exitMs);

    return () => clearTimeout(t);
  }, [open, exitMs]);

  return { mounted, closing };
}

/* ── Toasts ───────────────────────────────────────────────────────────────
   Feedback for an action whose result the user cannot otherwise see. A toast
   is a receipt, not a notification: it confirms, then it gets out of the way. */
type Toast = {
  id: number;
  title: string;
  detail?: string;
  tone: "ok" | "info" | "warn";
  leaving?: boolean;
};

type ToastCtx = { push: (t: Omit<Toast, "id" | "tone"> & { tone?: Toast["tone"] }) => void };

const Ctx = createContext<ToastCtx | null>(null);

export function useToast() {
  const ctx = useContext(Ctx);

  if (!ctx) throw new Error("useToast must be used inside <Toaster>");

  return ctx;
}


const TONE = {
  ok: { icon: <Check size={15} strokeWidth={3} />, ring: "ring-[#0f4c3a]/20", chip: "bg-[#0f4c3a]" },
  info: { icon: <Info size={15} />, ring: "ring-[#1d4ed8]/20", chip: "bg-[#1d4ed8]" },
  warn: { icon: <AlertTriangle size={15} />, ring: "ring-[#b3261e]/20", chip: "bg-[#b3261e]" },
};

export function Toaster({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef<number[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((p) => p.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    const t = window.setTimeout(() => setItems((p) => p.filter((x) => x.id !== id)), 200);
    timers.current.push(t);
  }, []);

  const push = useCallback<ToastCtx["push"]>(
    (t) => {
      const id = ++seq.current;
      setItems((p) => [...p.slice(-2), { id, tone: t.tone ?? "ok", title: t.title, detail: t.detail }]);

      if (t.tone !== "warn") tapFeedback(10);
      timers.current.push(window.setTimeout(() => dismiss(id), 3200));
    },
    [dismiss],
  );

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[max(5.25rem,calc(env(safe-area-inset-bottom)+4.5rem))] z-[60] flex flex-col items-center gap-2 px-3"
        role="status"
        aria-live="polite"
      >
        {items.map((t) => {
          const tone = TONE[t.tone];

          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto flex w-full max-w-[380px] items-start gap-2.5 rounded-2xl bg-white px-3 py-2.5 shadow-[0_18px_40px_-18px_rgba(23,35,59,0.5)] ring-1",
                tone.ring,
                t.leaving ? "toast-out" : "toast-in",
              )}
            >
              <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-white", tone.chip)}>
                <span className="check-pop grid place-items-center">{tone.icon}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-extrabold leading-tight text-slate-900">{t.title}</span>
                {t.detail && <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-500">{t.detail}</span>}
              </span>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="pressable -mr-1 -mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-400"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

/* ── Skeletons ───────────────────────────────────────────────────────────
   Shaped like the content they replace, so the layout never jumps when real
   data lands. A skeleton of the wrong shape is worse than no skeleton. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-lg", className)} aria-hidden />;
}

export function RowSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-[18px] bg-white px-3 py-3 ring-1 ring-slate-900/[0.06]"
          style={{ animation: "rise-in var(--dur-5) var(--ease-out) both", animationDelay: `${i * 40}ms` }}
        >
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/* ── Sheets ───────────────────────────────────────────────────────────────
   A sheet rises from the bottom edge on a spring and leaves faster than it
   arrived — a release should never wait on a decision the finger has made. */
export function Sheet({
  open, onClose, title, children, footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { mounted, closing } = usePresence(open, 200);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <button
        aria-label="Close"
        onClick={onClose}
        className={cn("absolute inset-0 bg-slate-900/35 backdrop-blur-[2px]", closing ? "scrim closing" : "scrim")}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative w-full max-w-[430px] rounded-t-[26px] bg-[#fdf8ee] pb-1 shadow-[0_-20px_50px_-24px_rgba(23,35,59,0.55)]",
          closing ? "sheet-up-out" : "sheet-up",
        )}
      >
        <div className="flex justify-center pb-1 pt-2.5">
          <span className="h-1 w-9 rounded-full bg-slate-900/15" />
        </div>
        <div className="flex items-center px-4 pb-2 pt-1">
          <h2 className="text-[15px] font-extrabold text-[#0f2b23]">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="pressable ml-auto grid h-8 w-8 place-items-center rounded-full bg-white text-slate-500 ring-1 ring-slate-900/10"
          >
            <X size={15} />
          </button>
        </div>
        <div className="max-h-[62dvh] overflow-y-auto overscroll-contain px-4 pb-3">{children}</div>
        {footer && <div className="sheet-safe border-t border-slate-900/10 px-4 pt-3">{footer}</div>}
      </div>
    </div>
  );
}
