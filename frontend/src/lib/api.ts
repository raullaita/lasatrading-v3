import type { MarketDataFile, WatchlistItem } from "@/types/data";
import type {
  BacktestDetail,
  BacktestQueued,
  BacktestRequest,
  BacktestRun,
  BacktestTaskResult,
} from "@/types/backtest";
import type { StrategyCatalogItem } from "@/types/strategies";
import type {
  OptimizationDetail,
  OptimizationQueued,
  OptimizationRequest,
  OptimizationResult,
  OptimizationRun,
  OptimizationStatusResponse,
} from "@/types/optimizer";
import type {
  CreateStrategyPayload,
  UpdateStrategyPayload,
  UserStrategy,
} from "@/types/portfolio";
import type {
  MonitorJob,
  PriceAlert,
  SignalLog,
  TestTelegramResult,
} from "@/types/monitor";
import type {
  CreateTradePayload,
  ExecutionAnalysis,
  ExecutionAnalysisRequest,
  JournalQueryParams,
  Trade,
  UpdateTradePayload,
} from "@/types/journal";
import type {
  EquityPoint,
  PerformanceSummary,
  StrategyPerformance,
} from "@/types/performance";
import type {
  SystemConfig,
  SystemHealth,
  SystemLogEntry,
  SystemLogsQuery,
} from "@/types/system";
import type {
  RegimeRequest,
  RegimeResponse,
  RegimesResponse,
  SweepHistoryItem,
  SweepResultsResponse,
  SweepRunQueued,
  SweepRunRequest,
  SweepStatusResponse,
} from "@/types/sweep";

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

export function getSymbols(): Promise<string[]> {
  return request<string[]>("/api/v1/data/symbols");
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

export function deleteDataFile(fileId: string): Promise<void> {
  return request<void>(`/api/v1/data/${fileId}`, {
    method: "DELETE",
  });
}

export function refreshDataFile(
  fileId: string
): Promise<{ message: string; new_candles: number }> {
  return request<{ message: string; new_candles: number }>(
    `/api/v1/data/${fileId}/refresh`,
    {
      method: "POST",
    }
  );
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

export function getBacktestHistory(
  filters: {
    strategy_name?: string;
    symbol?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<BacktestRun[]> {
  return request<BacktestRun[]>(`/api/v1/backtest/history${buildQuery(filters)}`);
}

export function getBacktestDetail(id: string): Promise<BacktestDetail> {
  return request<BacktestDetail>(`/api/v1/backtest/${id}`);
}

export function deleteBacktest(
  id: string
): Promise<{ status: string; id: string }> {
  return request<{ status: string; id: string }>(`/api/v1/backtest/${id}`, {
    method: "DELETE",
  });
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

export function getOptimizationHistory(
  filters: {
    strategy_name?: string;
    symbol?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<OptimizationRun[]> {
  return request<OptimizationRun[]>(
    `/api/v1/optimizer/history${buildQuery(filters)}`
  );
}

export function getOptimizationDetail(id: string): Promise<OptimizationDetail> {
  return request<OptimizationDetail>(`/api/v1/optimizer/${id}`);
}

export function deleteOptimization(
  id: string
): Promise<{ status: string; id: string }> {
  return request<{ status: string; id: string }>(`/api/v1/optimizer/${id}`, {
    method: "DELETE",
  });
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

export function getMonitorJobs(): Promise<MonitorJob[]> {
  return request<MonitorJob[]>("/api/v1/monitor/jobs");
}

export function getSignals(limit = 50): Promise<SignalLog[]> {
  return request<SignalLog[]>(`/api/v1/monitor/signals?limit=${limit}`);
}

export function getPriceAlerts(): Promise<PriceAlert[]> {
  return request<PriceAlert[]>("/api/v1/monitor/price-alerts");
}

export function createPriceAlert(payload: {
  symbol: string;
  condition: string;
  target_price: number;
}): Promise<PriceAlert> {
  return request<PriceAlert>("/api/v1/monitor/price-alerts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deletePriceAlert(id: string): Promise<{ status: string; id: string }> {
  return request<{ status: string; id: string }>(
    `/api/v1/monitor/price-alerts/${id}`,
    { method: "DELETE" }
  );
}

export function testTelegram(): Promise<TestTelegramResult> {
  return request<TestTelegramResult>("/api/v1/monitor/test-telegram", {
    method: "POST",
  });
}

function buildQuery(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function getTrades(params: JournalQueryParams = {}): Promise<Trade[]> {
  return request<Trade[]>(`/api/v1/journal/trades${buildQuery(params)}`);
}

export function createTrade(payload: CreateTradePayload): Promise<Trade> {
  return request<Trade>("/api/v1/journal/trades", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateTrade(
  id: string,
  payload: UpdateTradePayload
): Promise<Trade> {
  return request<Trade>(`/api/v1/journal/trades/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteTrade(id: string): Promise<{ status: string; id: string }> {
  return request<{ status: string; id: string }>(
    `/api/v1/journal/trades/${id}`,
    { method: "DELETE" }
  );
}

export function analyzeExecution(
  payload: ExecutionAnalysisRequest
): Promise<ExecutionAnalysis> {
  return request<ExecutionAnalysis>("/api/v1/journal/analyze-execution", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface PerformanceQueryParams {
  trade_type?: string;
  start_date?: string;
  end_date?: string;
}

export function getPerformanceSummary(
  params: PerformanceQueryParams = {}
): Promise<PerformanceSummary> {
  return request<PerformanceSummary>(
    `/api/v1/performance/summary${buildQuery(params)}`
  );
}

export function getEquityCurve(
  params: PerformanceQueryParams = {}
): Promise<EquityPoint[]> {
  return request<EquityPoint[]>(
    `/api/v1/performance/equity-curve${buildQuery(params)}`
  );
}

export function getPerformanceByStrategy(
  params: PerformanceQueryParams = {}
): Promise<StrategyPerformance[]> {
  return request<StrategyPerformance[]>(
    `/api/v1/performance/by-strategy${buildQuery(params)}`
  );
}

export function getSystemConfig(): Promise<SystemConfig> {
  return request<SystemConfig>("/api/v1/system/config");
}

export function updateSystemConfig(
  updates: Record<string, string | number | boolean>
): Promise<SystemConfig> {
  return request<SystemConfig>("/api/v1/system/config", {
    method: "PUT",
    body: JSON.stringify({ updates }),
  });
}

export function testSystemTelegram(): Promise<TestTelegramResult> {
  return request<TestTelegramResult>("/api/v1/system/config/test-telegram", {
    method: "POST",
  });
}

export function getSystemHealth(): Promise<SystemHealth> {
  return request<SystemHealth>("/api/v1/system/health");
}

export function getSystemLogs(
  params: SystemLogsQuery = {}
): Promise<SystemLogEntry[]> {
  return request<SystemLogEntry[]>(
    `/api/v1/system/logs${buildQuery(params)}`
  );
}

export function runSweep(payload: SweepRunRequest): Promise<SweepRunQueued> {
  return request<SweepRunQueued>("/api/v1/sweep/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getSweepStatus(): Promise<SweepStatusResponse> {
  return request<SweepStatusResponse>("/api/v1/sweep/status");
}

export function getSweepResults(): Promise<SweepResultsResponse> {
  return request<SweepResultsResponse>("/api/v1/sweep/results");
}

export function runMarketRegime(
  payload: RegimeRequest
): Promise<RegimeResponse> {
  return request<RegimeResponse>("/api/v1/sweep/regime", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getMarketRegimes(): Promise<RegimesResponse> {
  return request<RegimesResponse>("/api/v1/sweep/regimes");
}

export function getSweepHistory(
  limit = 20
): Promise<SweepHistoryItem[]> {
  return request<SweepHistoryItem[]>(
    `/api/v1/sweep/history?limit=${limit}`
  );
}