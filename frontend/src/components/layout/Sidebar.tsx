"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  BookOpen,
  Brain,
  Briefcase,
  Database,
  LayoutDashboard,
  Radio,
  Server,
  Settings,
  TrendingUp,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/lib/api";

type BackendStatus = "checking" | "online" | "offline";

const NAV_ITEMS = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  { href: "/data", label: "Datos", icon: Database },
  { href: "/strategies", label: "Estrategias", icon: Brain },
  { href: "/backtest", label: "Backtest", icon: Settings },
  { href: "/optimizer", label: "Optimizador", icon: Activity },
  { href: "/portfolio", label: "Portafolio", icon: Briefcase },
  { href: "/monitor", label: "Monitor", icon: Radio },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/performance", label: "Rendimiento", icon: BarChart3 },
  { href: "/system", label: "Sistema", icon: Server },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [status, setStatus] = useState<BackendStatus>("checking");

  useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`${API_BASE_URL}/api/v1/health`, {
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (active) setStatus(res.ok ? "online" : "offline");
      } catch {
        if (active) setStatus("offline");
      }
    };

    void check();
    const interval = setInterval(() => void check(), 60000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-slate-800 bg-slate-900">
      <div className="flex h-16 items-center gap-2.5 border-b border-slate-800 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-slate-950">
          <TrendingUp className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-bold tracking-tight text-slate-50">
            LasaTrading
          </p>
          <p className="text-[10px] text-slate-500">v3.0 · Algo Trading</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-50",
              isActive(item.href) && "bg-slate-800 text-emerald-400"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-slate-800 p-3">
        <div className="flex items-center gap-2 px-2 text-xs text-slate-500">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              status === "online"
                ? "bg-emerald-400"
                : status === "offline"
                  ? "bg-red-400"
                  : "bg-slate-500 animate-pulse"
            )}
          />
          <span
            className={cn(
              "font-medium",
              status === "online"
                ? "text-emerald-400"
                : status === "offline"
                  ? "text-red-400"
                  : "text-slate-500"
            )}
          >
            {status === "online"
              ? "Conectado"
              : status === "offline"
                ? "Desconectado"
                : "Conectando…"}
          </span>
          <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-600">
            API
          </span>
        </div>
      </div>
    </aside>
  );
}