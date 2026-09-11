import type { ExitRules } from "@/types/backtest";

export interface ParamRangeSpec {
  type: "int" | "float";
  min: number;
  max: number;
  step: number;
}

export interface OOSConfig {
  enabled: boolean;
  split_ratio: number;
  min_pf: number;
  max_degradation: number;
  min_trades: number;
}

export interface OptimizationRequest {
  symbol: string;
  timeframe: string;
  strategy_name: string;
  param_ranges: Record<string, ParamRangeSpec>;
  exit_rules: ExitRules;
  oos_config: OOSConfig;
  initial_capital: number;
  commission_pct: number;
  slippage_pct: number;
}

export type Verdict = "robust" | "overfit" | "failed";

export interface CandidateMetrics {
  win_rate: number;
  profit_factor: number | null;
  max_drawdown: number;
  total_trades: number;
}

export interface OptimizationCandidate {
  rank: number;
  params: Record<string, number>;
  is_metrics: CandidateMetrics;
  oos_metrics: CandidateMetrics;
  degradation: number;
  verdict: Verdict;
}

export interface OptimizationQueued {
  task_id: string;
  status: string;
  total_combinations: number;
}

export type OptimizationStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface OptimizationStatusResponse {
  status: OptimizationStatus;
  progress_pct: number;
  completed_combinations: number;
  total_combinations: number;
  top_candidates_partial: OptimizationCandidate[];
  error?: string | null;
}

export interface OptimizationResult {
  candidates: OptimizationCandidate[];
  total_combinations: number;
  completed_combinations: number;
}