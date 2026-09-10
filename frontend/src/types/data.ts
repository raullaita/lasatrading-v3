export type FreshnessStatus = "fresh" | "stale" | "missing";

export interface MarketDataFile {
  id: string;
  symbol: string;
  timeframe: string;
  file_path: string;
  row_count: number;
  first_candle_at: string | null;
  last_candle_at: string | null;
  file_size_mb: number;
  updated_at: string | null;
  freshness_status: FreshnessStatus;
}

export interface WatchlistItem {
  symbol: string;
  is_favorite: boolean;
  notes: string | null;
  added_at: string | null;
}