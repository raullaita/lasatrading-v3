import { cn } from "@/lib/utils";
import type { FreshnessStatus } from "@/types/data";

const MAP: Record<
  FreshnessStatus,
  { emoji: string; label: string; className: string }
> = {
  fresh: {
    emoji: "🟢",
    label: "Actualizado",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  },
  stale: {
    emoji: "🔴",
    label: "Desactualizado",
    className: "border-red-500/30 bg-red-500/10 text-red-400",
  },
  missing: {
    emoji: "⚪",
    label: "Falta archivo",
    className: "border-slate-500/30 bg-slate-500/10 text-slate-400",
  },
};

export default function FreshnessBadge({
  status,
}: {
  status: FreshnessStatus;
}) {
  const item = MAP[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        item.className
      )}
    >
      <span aria-hidden>{item.emoji}</span>
      {item.label}
    </span>
  );
}