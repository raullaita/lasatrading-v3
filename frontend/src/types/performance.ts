export interface PerformanceSummary {
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

export interface StrategyPerformance {
  strategy_id: string | null;
  name: string;
  symbol: string;
  trades: number;
  win_rate: number;
  profit_factor: number | null;
  pnl: number;
}