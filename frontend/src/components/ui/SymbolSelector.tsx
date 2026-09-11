"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { getSymbols } from "@/lib/api";

interface SymbolSelectorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function SymbolSelector({
  value,
  onChange,
  placeholder = "Buscar símbolo...",
}: SymbolSelectorProps) {
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const filteredSymbols = useMemo(() => {
    if (!value.trim()) return availableSymbols;
    const query = value.trim().toUpperCase();
    return availableSymbols.filter((s) => s.includes(query));
  }, [value, availableSymbols]);

  useEffect(() => {
    getSymbols().then(setAvailableSymbols).catch(() => {});
  }, []);

  const handleSelect = useCallback(
    (symbol: string) => {
      onChange(symbol);
      setIsOpen(false);
    },
    [onChange]
  );

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2.5 pl-10 pr-4 text-sm text-slate-50 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
        />
      </div>
      {isOpen && filteredSymbols.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl">
          {filteredSymbols.map((symbol) => (
            <li
              key={symbol}
              onClick={() => handleSelect(symbol)}
              className={cn(
                "cursor-pointer px-4 py-2 text-sm transition hover:bg-slate-800",
                value === symbol
                  ? "text-emerald-400"
                  : "text-slate-50"
              )}
            >
              {symbol}
            </li>
          ))}
        </ul>
      )}
      {isOpen && value.trim() && filteredSymbols.length === 0 && (
        <ul className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-900 py-2 shadow-xl">
          <li className="cursor-default px-4 py-2 text-sm text-slate-500">
            Símbolo no encontrado en la lista recomendada
          </li>
        </ul>
      )}
    </div>
  );
}