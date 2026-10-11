import { useRef, useState } from "react";
import { uploadPhoto } from "../lib/photo-functions";
import type { PhotoKind } from "../lib/photo-storage";

export function PhotoUploader({
  complaintId,
  kind = "before",
  onDone,
}: {
  complaintId: string;
  kind?: PhotoKind;
  onDone?: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  async function compress(file: File): Promise<string> {
    const bitmap = await createImageBitmap(file);
    const maxSide = 1280;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");

    // A null 2d context means the browser refused the allocation (private mode,
    // or an exhausted canvas pool). Failing loudly beats uploading a blank photo.
    if (!ctx) throw new Error("This browser could not process the image");

    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/webp", 0.72);
  }

  async function onPick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setErr("");

    try {
      for (const f of Array.from(files).slice(0, 3)) {
        const dataUrl = await compress(f);
        setPreview((p) => [...p, dataUrl]);
        const r = await uploadPhoto({ data: { complaintId, dataUrl, kind } });
        onDone?.(r.url);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    }

    setBusy(false);
  }

  return (
    <div className="rounded-2xl border border-dashed border-slate-900/20 bg-white/60 p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy ? "Uploading…" : "📸 Add photo"}
        </button>
        <span className="text-[11px] text-slate-500">jpg/png/webp · auto-compressed · max 3 at once</span>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => onPick(e.target.files)}
      />
      {preview.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {preview.map((p, i) => (
            <img key={i} src={p} alt="upload" className="h-20 w-20 rounded-xl object-cover" />
          ))}
        </div>
      )}
      {err && <p className="mt-2 text-xs font-bold text-red-600">{err}</p>}
    </div>
  );
}
