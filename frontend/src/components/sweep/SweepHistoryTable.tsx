"use client";

import { History } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SweepHistoryItem } from "@/types/sweep";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function SweepHistoryTable({
  items,
}: {
  items: SweepHistoryItem[];
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-4">
        <History className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-50">
          Historial de sweeps ({items.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2.5 font-medium">Fecha</th>
              <th className="px-3 py-2.5 font-medium">Estado</th>
              <th className="px-3 py-2.5 font-medium">Reset</th>
              <th className="px-3 py-2.5 font-medium">Timeframes</th>
              <th className="px-3 py-2.5 font-medium">Símbolos</th>
              <th className="px-3 py-2.5 font-medium">Resultados</th>
              <th className="px-3 py-2.5 font-medium">Resumen</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-sm text-slate-500"
                >
                  Aún no hay sweeps ejecutados.
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-slate-800/60 last:border-b-0 hover:bg-slate-800/40"
              >
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-300">
                  {formatDate(item.created_at)}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                      item.status === "completed"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : item.status === "failed"
                          ? "border-red-500/30 bg-red-500/10 text-red-400"
                          : "border-slate-700 bg-slate-800 text-slate-400"
                    )}
                  >
                    {item.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-300">
                  {item.reset ? "Sí" : "No"}
                </td>
                <td className="px-3 py-2.5 text-slate-300">
                  {item.timeframes.join(", ")}
                </td>
                <td className="px-3 py-2.5 text-slate-300">
                  {item.symbols_count}
                </td>
                <td className="px-3 py-2.5 font-semibold text-emerald-400">
                  {item.results_count}
                </td>
                <td className="px-3 py-2.5 text-slate-300">
                  {item.summary_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}