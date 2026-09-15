export interface SweepRunRequest {
  reset: boolean;
  timeframes: string[];
  symbols: string[];
}

export interface SweepRunQueued {
  run_id: string;
  status: string;
  reset: boolean;
}

export type SweepStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface SweepStatusResponse {
  status: SweepStatus;
  phase?: string | null;
  progress_pct: number;
  current_job: string;
  total_jobs: number;
  done_jobs: number;
  scan_count: number;
  holdout_count: number;
  error?: string | null;
  run_id?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface SweepResultRow {
  symbol: string;
  timeframe: string;
  strategy_name: string;
  params: string;
  is_pf: number | null;
  is_win_rate: number | null;
  is_max_dd: number | null;
  is_trades: number | null;
  oos_pf: number | null;
  oos_win_rate: number | null;
  oos_max_dd: number | null;
  oos_trades: number | null;
  degradation: number;
  verdict: string;
  confirm_net_profit: number | null;
  confirm_profit_factor: number | null;
  confirm_win_rate: number | null;
  confirm_max_dd: number | null;
  confirm_trades: number | null;
  holdout_pairs: string;
  holdout_positives: number;
  holdout_avg_pf: number;
  holdout_net: number;
  generalized: boolean | string;
  registered: string;
}

export interface SweepSummaryRow {
  symbol: string;
  timeframe: string;
  strategy_name: string;
  n_total: number;
  n_failed: number;
  n_overfit: number;
  n_robust: number;
  mean_is_pf: number | null;
  mean_oos_pf: number | null;
  mean_oos_dd: number | null;
  median_trades: number | null;
}

export interface NoGoReportRow {
  strategy_name: string;
  timeframe: string;
  n_datasets: number;
  n_total: number;
  n_failed: number;
  n_overfit: number;
  n_robust: number;
  pct_robust: number;
  mean_is_pf: number | null;
  mean_oos_pf: number | null;
  mean_oos_dd: number | null;
  median_trades: number | null;
}

export interface SweepResultsResponse {
  results: SweepResultRow[];
  summary: SweepSummaryRow[];
  no_go: NoGoReportRow[];
}

export interface MarketRegime {
  symbol: string;
  timeframe: string;
  regime: string;
  details: Record<string, number | string>;
}

export interface RegimeRequest {
  symbols: string[];
  timeframes: string[];
}

export interface RegimeResponse {
  count: number;
  regimes: MarketRegime[];
}

export interface RegimesResponse {
  regimes: MarketRegime[];
}

export interface SweepHistoryItem {
  id: string;
  run_id: string;
  status: string;
  reset: boolean;
  timeframes: string[];
  symbols_count: number;
  results_count: number;
  summary_count: number;
  output_dir: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}