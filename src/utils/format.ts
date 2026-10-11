import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function timeAgo(d: Date | string | number): string {
  const t = new Date(d).getTime();
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));

  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);

  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);

  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);

  if (days < 30) return `${days}d ago`;

  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function uid(prefix = ""): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
