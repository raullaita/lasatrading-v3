export type MonitorJobStatus = "idle" | "running" | "paused" | "stopped" | "error";

export interface MonitorJob {
  id: string;
  user_strategy_id: string;
  status: MonitorJobStatus;
  last_run_at: string | null;
  last_signal_at: string | null;
  error_count: number;
  created_at: string;
}

export interface SignalLog {
  id: string;
  job_id: string;
  symbol: string;
  timeframe: string;
  strategy_name: string;
  signal_type: "buy" | "sell";
  price: number;
  timestamp: string;
  telegram_sent: boolean;
}

export type PriceAlertCondition = ">" | "<";

export interface PriceAlert {
  id: string;
  symbol: string;
  condition: PriceAlertCondition;
  target_price: number;
  is_active: boolean;
  last_triggered_at: string | null;
  created_at: string;
}

export interface TestTelegramResult {
  sent: boolean;
  message: string;
}