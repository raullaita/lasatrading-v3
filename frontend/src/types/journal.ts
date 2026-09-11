export type TradeType = "backtest" | "paper" | "real";
export type TradeStatus = "open" | "closed" | "cancelled";
export type TradeDirection = "long" | "short";

export interface Trade {
  id: string;
  trade_type: TradeType;
  strategy_id: string | null;
  signal_id: string | null;
  symbol: string;
  direction: TradeDirection;
  entry_price_expected: number | null;
  entry_price_actual: number | null;
  entry_timestamp: string | null;
  exit_price_expected: number | null;
  exit_price_actual: number | null;
  exit_timestamp: string | null;
  quantity: number | null;
  commission: number;
  pnl_net: number | null;
  status: TradeStatus;
  notes: string | null;
  created_at: string;
}

export type CreateTradePayload = Omit<Trade, "id" | "created_at">;

export type UpdateTradePayload = Partial<
  Omit<Trade, "id" | "created_at">
>;

export interface ExecutionAnalysis {
  slippage_pct: number;
  latency_seconds: number;
  impact_pnl: number;
}

export interface ExecutionAnalysisRequest {
  signal_timestamp: string;
  execution_timestamp: string;
  expected_price: number;
  actual_price: number;
  direction: TradeDirection;
}

export interface JournalQueryParams {
  trade_type?: TradeType;
  status?: TradeStatus;
  direction?: TradeDirection;
  limit?: number;
}