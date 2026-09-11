import type { ExitRules } from "@/types/backtest";

export interface RiskManagement {
  type: string;
  value: number;
}

export interface UserStrategy {
  id: string;
  name: string;
  is_active: boolean;
  base_strategy_name: string;
  symbol: string;
  timeframe: string;
  pattern_params: Record<string, number>;
  exit_rules: ExitRules;
  risk_management: RiskManagement;
  created_at: string;
  updated_at?: string;
}

export type CreateStrategyPayload = Omit<UserStrategy, "id" | "created_at" | "updated_at">;

export type UpdateStrategyPayload = Partial<
  Omit<UserStrategy, "id" | "created_at" | "updated_at">
>;