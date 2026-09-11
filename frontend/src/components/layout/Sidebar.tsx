"use client";

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

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900">
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
    </aside>
  );
}