import os
from datetime import datetime, timezone
from typing import Dict, List

import pandas as pd

CANDLE_COLUMNS = ["timestamp", "open", "high", "low", "close", "volume"]


def _normalize_candles(candles: List[Dict]) -> pd.DataFrame:
    df = pd.DataFrame(candles)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True).dt.tz_convert("UTC")
    df = df[CANDLE_COLUMNS]
    df = df.sort_values("timestamp").drop_duplicates(subset="timestamp", keep="last")
    return df.reset_index(drop=True)


def read_candles(file_path: str) -> pd.DataFrame:
    df = pd.read_parquet(file_path)
    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True).dt.tz_convert("UTC")
    return df


def load_parquet(file_path: str) -> pd.DataFrame:
    df = read_candles(file_path)
    if "timestamp" in df.columns:
        df = df.sort_values("timestamp")
    return df.reset_index(drop=True)


def get_parquet_metadata(file_path: str) -> Dict | None:
    if not os.path.exists(file_path):
        return None
    df = read_candles(file_path)
    size_bytes = os.path.getsize(file_path)
    return {
        "row_count": int(len(df)),
        "first_candle_at": df["timestamp"].min().to_pydatetime(),
        "last_candle_at": df["timestamp"].max().to_pydatetime(),
        "file_size_mb": round(size_bytes / 1_000_000, 2),
    }


def append_candles(file_path: str, new_candles: List[Dict]) -> int:
    if not new_candles:
        return 0

    new_df = _normalize_candles(new_candles)
    existing_df = None

    if os.path.exists(file_path):
        existing_df = read_candles(file_path)
        last_ts = existing_df["timestamp"].max()
        new_df = new_df[new_df["timestamp"] > last_ts]

    if new_df.empty:
        return 0

    os.makedirs(os.path.dirname(file_path) or ".", exist_ok=True)

    result = new_df if existing_df is None else pd.concat([existing_df, new_df], ignore_index=True)
    result = (
        result.sort_values("timestamp")
        .drop_duplicates(subset="timestamp", keep="last")
        .reset_index(drop=True)
    )

    result.to_parquet(file_path, engine="pyarrow", index=False)
    return len(new_df)