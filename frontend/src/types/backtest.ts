export interface ExitRules {
  stop_loss_type: string;
  stop_loss_value: number;
  take_profit_type: string;
  take_profit_value: number;
}

export interface BacktestRequest {
  symbol: string;
  timeframe: string;
  strategy_name: string;
  strategy_params: Record<string, number>;
  exit_rules: ExitRules;
  initial_capital: number;
  commission_pct: number;
  slippage_pct: number;
}

export interface BacktestMetrics {
  net_profit: number;
  win_rate: number;
  profit_factor: number | null;
  max_drawdown: number;
  total_trades: number;
}

export interface EquityPoint {
  timestamp: string;
  balance: number;
}

export interface BacktestTrade {
  entry_time: string;
  entry_price: number;
  exit_time: string;
  exit_price: number;
  pnl: number;
  pnl_pct: number;
  duration: number;
  exit_reason: string;
}

export interface BacktestResult {
  metrics: BacktestMetrics;
  equity_curve: EquityPoint[];
  trades: BacktestTrade[];
}

export type BacktestTaskResult = {
  status: "running" | "completed" | "error";
  detail?: string;
} & Partial<BacktestResult>;

export interface BacktestQueued {
  task_id: string;
  status: string;
}

export interface BacktestRun {
  id: string;
  symbol: string;
  timeframe: string;
  strategy_name: string;
  metrics: BacktestMetrics;
  created_at: string;
}

export interface BacktestDetail {
  id: string;
  symbol: string;
  timeframe: string;
  strategy_name: string;
  created_at: string;
  params: Record<string, number>;
  exit_rules: ExitRules;
  metrics: BacktestMetrics;
  equity_curve: EquityPoint[];
  trades: BacktestTrade[];
}