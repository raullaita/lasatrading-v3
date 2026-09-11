import type { MarketDataFile, WatchlistItem } from "@/types/data";
import type {
  BacktestQueued,
  BacktestRequest,
  BacktestTaskResult,
} from "@/types/backtest";
import type { StrategyCatalogItem } from "@/types/strategies";
import type {
  OptimizationQueued,
  OptimizationRequest,
  OptimizationResult,
  OptimizationStatusResponse,
} from "@/types/optimizer";
import type {
  CreateStrategyPayload,
  UpdateStrategyPayload,
  UserStrategy,
} from "@/types/portfolio";

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

export function runBacktest(payload: BacktestRequest): Promise<BacktestQueued> {
  return request<BacktestQueued>("/api/v1/backtest/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getBacktestResults(taskId: string): Promise<BacktestTaskResult> {
  return request<BacktestTaskResult>(`/api/v1/backtest/results/${taskId}`);
}

export function runOptimization(
  payload: OptimizationRequest
): Promise<OptimizationQueued> {
  return request<OptimizationQueued>("/api/v1/optimizer/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getOptimizationStatus(
  taskId: string
): Promise<OptimizationStatusResponse> {
  return request<OptimizationStatusResponse>(
    `/api/v1/optimizer/status/${taskId}`
  );
}

export function cancelOptimization(taskId: string): Promise<void> {
  return request<void>(`/api/v1/optimizer/cancel/${taskId}`, {
    method: "POST",
  });
}

export function getOptimizationResults(
  taskId: string
): Promise<OptimizationResult> {
  return request<OptimizationResult>(`/api/v1/optimizer/results/${taskId}`);
}

export function getStrategies(
  activeOnly = false
): Promise<UserStrategy[]> {
  const query = activeOnly ? "?active_only=true" : "";
  return request<UserStrategy[]>(`/api/v1/portfolio/strategies${query}`);
}

export function createStrategy(
  data: CreateStrategyPayload
): Promise<UserStrategy> {
  return request<UserStrategy>("/api/v1/portfolio/strategies", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateStrategy(
  id: string,
  data: UpdateStrategyPayload
): Promise<UserStrategy> {
  return request<UserStrategy>(`/api/v1/portfolio/strategies/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteStrategy(id: string): Promise<{ status: string; id: string }> {
  return request<{ status: string; id: string }>(
    `/api/v1/portfolio/strategies/${id}`,
    { method: "DELETE" }
  );
}

export function toggleStrategy(id: string): Promise<UserStrategy> {
  return request<UserStrategy>(`/api/v1/portfolio/strategies/${id}/toggle`, {
    method: "PATCH",
  });
}