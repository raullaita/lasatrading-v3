import type { MarketDataFile, WatchlistItem } from "@/types/data";
import type { StrategyCatalogItem } from "@/types/strategies";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body || res.statusText}`);
  }

  return (await res.json()) as T;
}

export function getDataStatus(): Promise<MarketDataFile[]> {
  return request<MarketDataFile[]>("/api/v1/data/status");
}

export function importData(payload: {
  symbols: string[];
  timeframes: string[];
  start_date: string;
}): Promise<{ task_id: string; status: string }> {
  return request("/api/v1/data/import", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getWatchlist(): Promise<WatchlistItem[]> {
  return request<WatchlistItem[]>("/api/v1/watchlist");
}

export function addToWatchlist(symbol: string): Promise<void> {
  return request<void>("/api/v1/watchlist", {
    method: "POST",
    body: JSON.stringify({ symbol }),
  });
}

export function getStrategiesCatalog(): Promise<StrategyCatalogItem[]> {
  return request<StrategyCatalogItem[]>("/api/v1/strategies/catalog");
}

export function getStrategyDetail(name: string): Promise<StrategyCatalogItem> {
  return request<StrategyCatalogItem>(`/api/v1/strategies/catalog/${name}`);
}