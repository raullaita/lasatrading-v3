"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, Server } from "lucide-react";

import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/lib/api";

const SECTION_TITLES: Record<string, string> = {
  "/": "Inicio",
  "/data": "Datos de Mercado",
  "/strategies": "Estrategias",
  "/backtest": "Backtest",
  "/optimizer": "Optimizador",
  "/portfolio": "Portafolio",
  "/monitor": "Monitor y Alertas",
  "/journal": "Journal de Trading",
  "/performance": "Rendimiento",
  "/system": "Configuración y Sistema",
};

type BackendStatus = "loading" | "online" | "offline";

export default function Topbar() {
  const pathname = usePathname();
  const [status, setStatus] = useState<BackendStatus>("loading");

  useEffect(() => {
    let active = true;

    const check = () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      fetch(`${API_BASE_URL}/api/v1/health`, { signal: controller.signal })
        .then((res) => {
          if (res.ok) setStatus("online");
          else setStatus("offline");
        })
        .catch(() => setStatus("offline"))
        .finally(() => {
          clearTimeout(timer);
          if (!active) controller.abort();
        });
    };

    const initial = setTimeout(() => void check(), 0);
    const interval = setInterval(() => void check(), 30000);

    return () => {
      active = false;
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, []);

  const title = SECTION_TITLES[pathname] ?? "LasaTrading v3.0";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-6">
      <h2 className="text-sm font-semibold text-slate-50">{title}</h2>

      <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs">
        {status === "loading" ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin text-slate-500" />
            <span className="text-slate-500">Conectando…</span>
          </>
        ) : (
          <>
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                status === "online" ? "bg-emerald-400" : "bg-red-400"
              )}
            />
            <span
              className={cn(
                "font-medium",
                status === "online" ? "text-emerald-400" : "text-red-400"
              )}
            >
              {status === "online" ? "Online" : "Offline"}
            </span>
          </>
        )}
        <Server className="h-3.5 w-3.5 text-slate-500" />
      </div>
    </header>
  );
}