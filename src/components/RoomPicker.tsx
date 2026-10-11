import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { usePresence, tapFeedback } from "./motion";
import { listRooms } from "../lib/rooms-functions";
import { cn } from "../utils/format";

type Room = { id: string; floor: number; roomNo: string; capacity: number };

/**
 * Room picker, as a bottom sheet rather than a native <select>.
 *
 * Why a sheet: a select renders the OS picker list, which loses the floor
 * context that makes a hostel addressable ("2nd floor, room 204"). Splitting
 * floor from room keeps each tap unambiguous and lets the thumb travel on a
 * spring between floors instead of cutting.
 *
 * Motion: the sheet rises on a spring, the room grid staggers in behind it,
 * the chosen cell pops, and dragging down dismisses past a threshold with the
 * finger attached to the surface. Exit is always faster than entry.
 */
export function RoomPicker({
  open, onClose, hostelId, value, onChange, myRoomId,
}: {
  open: boolean;
  onClose: () => void;
  hostelId: string;
  value: string;
  onChange: (roomNo: string) => void;
  myRoomId?: string | null;
}) {
  const { mounted, closing } = usePresence(open, 200);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [floor, setFloor] = useState(1);

  // Load on open, not on mount: the resident usually opens this once per
  // complaint and the list is identical every time.
  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    listRooms({ data: { hostelId } })
      .then((r) => {
        if (!live) return;
        setRooms(r);
        // Land on the floor the current value belongs to, so reopening the
        // sheet shows the chosen room rather than always floor 1.
        const hit = r.find((x) => x.id === value || x.roomNo === value);

        if (hit) setFloor(hit.floor);
      })
      .catch(() => live && setRooms([]))
      .finally(() => live && setLoading(false));

    return () => {
      live = false;
    };
  }, [open, hostelId, value]);

  const floors = useMemo(
    () => Array.from(new Set(rooms.map((r) => r.floor))).sort((a, b) => a - b),
    [rooms],
  );

  const onFloor = useMemo(() => rooms.filter((r) => r.floor === floor), [rooms, floor]);
  const selected = rooms.find((r) => r.roomNo === value || r.id === value);
  const isMine = Boolean(myRoomId) && (selected?.id === myRoomId || selected?.roomNo === myRoomId);
  void isMine;

  /* Swipe to dismiss: the surface stays under the finger, then either springs
     back or is released. Transform-only, so it tracks the gesture at 60fps. */
  const [drag, setDrag] = useState(0);
  const startY = useRef(0);
  const active = useRef(false);

  function onDown(e: React.PointerEvent<HTMLElement>) {
    active.current = true;
    startY.current = e.clientY;
    // Capture keeps the drag alive when the pointer leaves the sheet mid-gesture.
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onMove(e: React.PointerEvent) {
    if (!active.current) return;
    // Downward only: the sheet has nowhere to go above its resting place.
    setDrag(Math.max(0, e.clientY - startY.current));
  }

  function onUp() {
    if (!active.current) return;
    active.current = false;

    if (drag > 90) {
      tapFeedback(8);
      onClose();
    }

    setDrag(0);
  }

  useEffect(() => {
    if (!open) setDrag(0);
  }, [open]);

  // Lock the page behind the sheet so the content underneath cannot scroll
  // under the thumb, and mark the body so the global "block drag" rule below
  // does not swallow taps meant for the scrim.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape closes, matching every other surface in the app.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <button
        aria-label="Close room picker"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-slate-900/35 backdrop-blur-[2px]",
          closing ? "scrim closing" : "scrim",
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose your room"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={drag ? { transform: `translate3d(0, ${drag}px, 0)` } : undefined}
        className={cn(
          "relative w-full max-w-[430px] rounded-t-[26px] bg-[#fdf8ee] pb-1 shadow-[0_-20px_50px_-24px_rgba(23,35,59,0.55)]",
          drag ? "transition-none" : closing ? "sheet-up-out" : "sheet-up",
        )}
      >
        {/* Grabber doubles as the drag handle. */}
        <div className="flex justify-center pb-1 pt-2.5">
          <span className="h-1 w-9 rounded-full bg-slate-900/15" />
        </div>
        <div className="flex items-center px-4 pb-2 pt-1">
          <div>
            <h2 className="text-[15px] font-extrabold text-[#0f2b23]">Which room?</h2>
            <p className="text-[11px] text-slate-500">
              {loading
                ? "Loading rooms…"
                : selected
                  ? `Room ${selected.roomNo}`
                  : "Pick a floor, then a room"}
            </p>
          </div>
          {selected && (
            <span className="check-pop ml-auto grid h-7 w-7 place-items-center rounded-full bg-[#0f4c3a] text-white">
              <Check size={14} strokeWidth={3} />
            </span>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-4 gap-2 px-4 pb-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton h-[52px] rounded-2xl" />
            ))}
          </div>
        ) : (
          <>
            {/* Floor control. The thumb is one element that travels, so the
                control reads as a single physical slider, not four buttons. */}
            {floors.length > 1 && (
              <div className="relative mx-4 mt-1 flex rounded-2xl bg-slate-900/[0.05] p-1">
                <span
                  aria-hidden
                  className="seg-thumb absolute inset-y-1 left-1 rounded-xl bg-white shadow-[0_2px_8px_-2px_rgba(23,35,59,0.25)]"
                  style={{
                    width: `calc((100% - 0.5rem) / ${floors.length})`,
                    transform: `translate3d(${(floors.indexOf(floor) * 100).toFixed(2)}%, 0, 0)`,
                  }}
                />
                {floors.map((f) => (
                  <button
                    key={f}
                    onClick={() => {
                      tapFeedback(6);
                      setFloor(f);
                    }}
                    className={cn(
                      "seg-label pressable-sm relative z-10 py-2 text-[12.5px] font-extrabold",
                      floor === f ? "text-[#0f4c3a]" : "text-slate-400",
                    )}
                    style={{ width: `${100 / floors.length}%` }}
                  >
                    {f === 1 ? "1st" : f === 2 ? "2nd" : f === 3 ? "3rd" : "4th"}
                  </button>
                ))}
              </div>
            )}

            <div key={floor} className="stagger grid grid-cols-4 gap-2 px-4 pb-3 pt-3">
              {onFloor.map((r) => {
                const on = selected?.id === r.id;
                const mine = myRoomId === r.id || myRoomId === r.roomNo;

                return (
                  <button
                    key={r.id}
                    onPointerDown={() => tapFeedback(7)}
                    onClick={() => {
                      onChange(r.roomNo);
                      tapFeedback([10, 30, 12]);
                    }}
                    className={cn(
                      "pressable relative flex flex-col items-center justify-center rounded-2xl py-2.5",
                      on
                        ? "bg-[#0f4c3a] text-white shadow-[0_8px_20px_-10px_rgba(15,76,58,0.7)]"
                        : "bg-white text-slate-700 ring-1 ring-slate-900/[0.07]",
                    )}
                  >
                    <span className="tnum text-[15px] font-extrabold leading-none">{r.roomNo}</span>
                    {mine && (
                      <span
                        className={cn(
                          "mt-0.5 text-[8.5px] font-extrabold uppercase tracking-wide",
                          on ? "text-white/70" : "text-[#1a7f4b]",
                        )}
                      >
                        yours
                      </span>
                    )}
                    {on && (
                      <span className="check-pop absolute right-1 top-1">
                        <Check size={10} strokeWidth={4} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="sheet-safe border-t border-slate-900/10 px-4 pt-3">
          <button
            disabled={!selected}
            onClick={onClose}
            className="pressable w-full rounded-2xl bg-[#0f4c3a] py-3.5 text-sm font-extrabold text-white disabled:opacity-40"
          >
            {selected ? `Use room ${selected.roomNo}` : "Select a room"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
