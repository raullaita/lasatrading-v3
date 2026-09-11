export type LogLevel = "INFO" | "WARNING" | "ERROR";

export interface TradingConfig {
  initial_capital: number | string;
  risk_percent: number | string;
}

export interface NotificationConfig {
  telegram_token: string;
  telegram_chat_id: string;
  telegram_is_configured: boolean;
}

export interface SystemConfig {
  trading: TradingConfig;
  notifications: NotificationConfig;
}

export interface ServiceStatus {
  status: "ok" | "error" | "warning";
  error?: string;
  latency_ms?: number;
  free_gb?: number;
  total_gb?: number;
  percent_used?: number;
  is_configured?: boolean;
}

export interface SystemHealth {
  database: ServiceStatus;
  redis: ServiceStatus;
  disk_space: ServiceStatus;
  binance_api: ServiceStatus;
  telegram: ServiceStatus;
  checked_at: string;
}

export interface SystemLogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  details: Record<string, unknown> | null;
}

export interface SystemLogsQuery {
  level?: LogLevel;
  module?: string;
  limit?: number;
}