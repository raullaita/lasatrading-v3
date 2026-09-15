"""mass_sweep_engine.py — Barrido masivo con validación anti-data-snooping.

Ejecuta el pipeline completo integrado en el backend:
  F0/F1) Import del universo (6 meses)
  F2) Sweep: (symbol x tf x estrategia) -> optimización grid coarse
  F3) Confirm full-window en símbolos ganadores del barrido
  F4) Validación hold-out (5 símbolos reservados)
  F5) Salidas: results, summary, no_go + registro portfolio

Market Regime Analyzer: clasifica cada (symbol, tf) en régimen de mercado
y cruza con los resultados del sweep.
"""

import logging
import os
import random
import re
import statistics
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from itertools import product

import pandas as pd
from sqlalchemy import select

from app.core.config import DATA_STORAGE_DIR
from app.core.models import MarketDataFile, SweepRun, UserStrategy
from app.core.optimizer_engine import run_optimization
from app.core.strategies.base import BaseStrategy
from app.core.strategies.registry import registry
from app.infra.db import SessionLocal
from app.infra.parquet_utils import load_parquet
from app.services.data_import_service import download_symbol_timeframe

logger = logging.getLogger(__name__)

SWEEP_OUTPUT_DIR = os.path.join(DATA_STORAGE_DIR, "sweep_runs")
os.makedirs(SWEEP_OUTPUT_DIR, exist_ok=True)

TIMEFRAMES = ["5m", "15m", "30m", "1h", "4h", "1d"]
HISTORY_DAYS = 183
IMPORT_BATCH_SYMBOLS = 20
HOLDOUT_COUNT = 5
HOLDOUT_SEED = 42
CONCURRENCY = 4
REQUEST_GAP_SEC = 0.5
DATA_POLL_SEC = 10.0
MAX_IMPORT_WAIT_SEC = 1200

EXIT_RULES = {
    "stop_loss_type": "atr_multiplier",
    "stop_loss_value": 1.5,
    "take_profit_type": "risk_reward_ratio",
    "take_profit_value": 2.0,
}
INITIAL_CAPITAL = 10000.0
COMMISSION_PCT = 0.001
SLIPPAGE_PCT = 0.1

OOS_CONFIG = {
    "enabled": True,
    "split_ratio": 0.7,
    "min_pf": 1.2,
    "max_degradation": 0.3,
    "min_trades": 15,
}

STRATEGIES = [
    {"name": "ema_crossover", "param_ranges": {
        "FAST_EMA": {"type": "int", "min": 10, "max": 30, "step": 10},
        "SLOW_EMA": {"type": "int", "min": 50, "max": 150, "step": 50}}},
    {"name": "macd_crossover", "param_ranges": {
        "FAST_PERIOD": {"type": "int", "min": 12, "max": 20, "step": 8},
        "SLOW_PERIOD": {"type": "int", "min": 26, "max": 40, "step": 14},
        "SIGNAL_PERIOD": {"type": "int", "min": 9, "max": 15, "step": 6}}},
    {"name": "rsi_ob_os", "param_ranges": {
        "RSI_PERIOD": {"type": "int", "min": 7, "max": 21, "step": 7}}},
    {"name": "stochastic", "param_ranges": {
        "K_PERIOD": {"type": "int", "min": 7, "max": 21, "step": 7}}},
    {"name": "atr_breakout", "param_ranges": {
        "ATR_PERIOD": {"type": "int", "min": 7, "max": 21, "step": 7},
        "ATR_MULTIPLIER": {"type": "float", "min": 2.0, "max": 3.0, "step": 1.0}}},
    {"name": "bollinger_bounce", "param_ranges": {
        "PERIOD": {"type": "int", "min": 15, "max": 30, "step": 15},
        "NUM_STD": {"type": "float", "min": 2.0, "max": 2.5, "step": 0.5}}},
    {"name": "price_channel", "param_ranges": {
        "PERIOD": {"type": "int", "min": 20, "max": 60, "step": 20}}},
    {"name": "volume_spike", "param_ranges": {
        "LOOKBACK": {"type": "int", "min": 20, "max": 40, "step": 20},
        "MULTIPLIER": {"type": "float", "min": 2.0, "max": 2.5, "step": 0.5}}},
    {"name": "golden_cross", "param_ranges": {
        "EMA_FAST": {"type": "int", "min": 12, "max": 20, "step": 8},
        "EMA_SLOW": {"type": "int", "min": 26, "max": 50, "step": 24}}},
    {"name": "rsi_divergence", "param_ranges": {
        "RSI_PERIOD": {"type": "int", "min": 14, "max": 21, "step": 7},
        "PIVOT_WINDOW": {"type": "int", "min": 30, "max": 45, "step": 15}}},
    {"name": "bullish_engulfing", "param_ranges": {
        "LOOKBACK": {"type": "int", "min": 2, "max": 5, "step": 3}}},
    {"name": "bearish_engulfing", "param_ranges": {
        "LOOKBACK": {"type": "int", "min": 2, "max": 5, "step": 3}}},
    {"name": "sma_crossover", "param_ranges": {
        "FAST_SMA": {"type": "int", "min": 10, "max": 50, "step": 20},
        "SLOW_SMA": {"type": "int", "min": 50, "max": 200, "step": 50}}},
    {"name": "rsi_50_cross", "param_ranges": {
        "RSI_PERIOD": {"type": "int", "min": 7, "max": 21, "step": 7}}},
    {"name": "cci_breakout", "param_ranges": {
        "CCI_PERIOD": {"type": "int", "min": 10, "max": 30, "step": 10},
        "UP_LEVEL": {"type": "float", "min": 100.0, "max": 150.0, "step": 50.0},
        "DOWN_LEVEL": {"type": "float", "min": -150.0, "max": -100.0, "step": 50.0}}},
    {"name": "williams_r", "param_ranges": {
        "LOOKBACK": {"type": "int", "min": 7, "max": 21, "step": 7}}},
    {"name": "donchian_breakout", "param_ranges": {
        "LOOKBACK": {"type": "int", "min": 10, "max": 40, "step": 15}}},
    {"name": "super_trend", "param_ranges": {
        "ATR_PERIOD": {"type": "int", "min": 7, "max": 14, "step": 7},
        "MULTIPLIER": {"type": "float", "min": 2.0, "max": 3.5, "step": 1.5}}},
    {"name": "keltner_breakout", "param_ranges": {
        "EMA_PERIOD": {"type": "int", "min": 15, "max": 25, "step": 10},
        "ATR_PERIOD": {"type": "int", "min": 7, "max": 14, "step": 7},
        "MULTIPLIER": {"type": "float", "min": 2.0, "max": 3.0, "step": 1.0}}},
    {"name": "heikin_ashi_ema", "param_ranges": {
        "EMA_PERIOD": {"type": "int", "min": 15, "max": 50, "step": 15}}},
    {"name": "obv_slope", "param_ranges": {
        "WINDOW": {"type": "int", "min": 10, "max": 40, "step": 15}}},
    {"name": "roc_momentum", "param_ranges": {
        "ROC_PERIOD": {"type": "int", "min": 10, "max": 30, "step": 10}}},
]

WINNER_MIN_OOS_PF = 1.3
WINNER_MIN_NET_PROFIT = 0.0
WINNER_MIN_TRADES = 20
MAX_REGISTER = 5

GENERALIZED_MIN_POSITIVE = 3
GENERALIZED_MIN_AVG_PF = 1.0

FIELDNAMES_RESULTS = [
    "symbol", "timeframe", "strategy_name", "params",
    "is_pf", "is_win_rate", "is_max_dd", "is_trades",
    "oos_pf", "oos_win_rate", "oos_max_dd", "oos_trades",
    "degradation", "verdict",
    "confirm_net_profit", "confirm_profit_factor",
    "confirm_win_rate", "confirm_max_dd", "confirm_trades",
    "holdout_pairs", "holdout_positives", "holdout_avg_pf",
    "holdout_net", "generalized", "registered",
]

FIELDNAMES_SUMMARY = [
    "symbol", "timeframe", "strategy_name",
    "n_total", "n_failed", "n_overfit", "n_robust",
    "mean_is_pf", "mean_oos_pf", "mean_oos_dd", "median_trades",
]

TOP_SYMBOLS: list[str] = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
    "ADAUSDT", "DOGEUSDT", "DOTUSDT", "MATICUSDT", "LTCUSDT",
    "AVAXUSDT", "LINKUSDT", "ATOMUSDT", "UNIUSDT", "APTUSDT",
    "NEARUSDT", "FILUSDT", "AAVEUSDT", "GRTUSDT", "SANDUSDT",
    "AXSUSDT", "FLOWUSDT", "XTZUSDT", "ALGOUSDT", "VETUSDT",
    "THETAUSDT", "EGLDUSDT", "ICPUSDT", "FTMUSDT", "HBARUSDT",
    "WIFUSDT", "BONKUSDT", "TIAUSDT", "JUPUSDT", "WLDUSDT",
    "RENDERUSDT", "ARUSDT", "SUIUSDT", "TAOUSDT", "SEIUSDT",
    "ONDOUSDT", "RAYUSDT", "JTOUSDT", "PEPEUSDT", "FLOKIUSDT",
    "SHIBUSDT", "LRCUSDT", "ENSUSDT", "MAGICUSDT", "SLPUSDT",
]


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _params_to_str(params: dict) -> str:
    return "|".join(f"{k}={v}" for k, v in params.items())


def _parse_params(s: str) -> dict:
    out: dict = {}
    for pair in s.split("|"):
        if "=" in pair:
            k, v = pair.split("=", 1)
            out[k] = float(v) if re.match(r"^-?\d+\.\d+$", v) else int(v)
    return out


def _start_date_6m() -> str:
    return (datetime.now(timezone.utc) - timedelta(days=HISTORY_DAYS)).strftime("%Y-%m-%d")


def _mean(vals: list) -> float | None:
    nums: list[float] = []
    for v in vals:
        try:
            if v is not None and v != "":
                nums.append(float(v))
        except (TypeError, ValueError):
            continue
    return round(statistics.mean(nums), 4) if nums else None


def _median(vals: list) -> float | None:
    nums: list[float] = []
    for v in vals:
        try:
            if v is not None and v != "":
                nums.append(float(v))
        except (TypeError, ValueError):
            continue
    return statistics.median(nums) if nums else None


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def _get_data_pairs() -> set[tuple[str, str]]:
    db = SessionLocal()
    try:
        rows = db.execute(select(MarketDataFile.symbol, MarketDataFile.timeframe)).all()
        return {(r[0], r[1]) for r in rows}
    finally:
        db.close()


def _delete_all_data_files() -> None:
    db = SessionLocal()
    try:
        files = db.execute(select(MarketDataFile)).scalars().all()
        for f in files:
            if f.file_path and os.path.exists(f.file_path):
                try:
                    os.remove(f.file_path)
                except OSError:
                    pass
            db.delete(f)
        db.commit()
    finally:
        db.close()


def _get_available_parquet(symbol: str, timeframe: str) -> pd.DataFrame | None:
    path = os.path.join(DATA_STORAGE_DIR, f"{symbol}_{timeframe}.parquet")
    if not os.path.exists(path):
        return None
    return load_parquet(path)


# ---------------------------------------------------------------------------
# Market Regime Analyzer
# ---------------------------------------------------------------------------

def analyze_market_regime(df: pd.DataFrame) -> dict:
    if df is None or df.empty or len(df) < 50:
        return {"regime": "insufficient_data", "details": {}}

    close = df["close"].astype(float)
    volume = df["volume"].astype(float) if "volume" in df.columns else pd.Series([0.0] * len(df))

    sma_20 = close.rolling(20).mean()
    sma_50 = close.rolling(50).mean()
    sma_200 = close.rolling(min(200, len(close))).mean()

    last_close = close.iloc[-1]
    last_sma20 = sma_20.iloc[-1] if pd.notna(sma_20.iloc[-1]) else last_close
    last_sma50 = sma_50.iloc[-1] if pd.notna(sma_50.iloc[-1]) else last_close

    price_vs_sma20 = (last_close - last_sma20) / last_sma20 if last_sma20 else 0
    price_vs_sma50 = (last_close - last_sma50) / last_sma50 if last_sma50 else 0

    sma20_slope = (sma_20.iloc[-1] - sma_20.iloc[-20]) / sma_20.iloc[-20] if pd.notna(sma_20.iloc[-20]) and sma_20.iloc[-20] != 0 else 0
    sma50_slope = (sma_50.iloc[-1] - sma_50.iloc[-50]) / sma_50.iloc[-50] if len(sma_50.dropna()) >= 50 and pd.notna(sma_50.iloc[-50]) and sma_50.iloc[-50] != 0 else 0

    returns = close.pct_change().dropna()
    volatility_20 = returns.iloc[-20:].std() * (365 ** 0.5) if len(returns) >= 20 else 0

    avg_volume_20 = volume.iloc[-20:].mean() if len(volume) >= 20 else volume.mean()
    avg_volume_50 = volume.iloc[-50:].mean() if len(volume) >= 50 else volume.mean()
    volume_trend = (avg_volume_20 / avg_volume_50) if avg_volume_50 else 1.0

    atr_period = 14
    if len(df) >= atr_period + 1:
        high = df["high"].astype(float)
        low = df["low"].astype(float)
        tr = pd.concat([
            high - low,
            (high - close.shift(1)).abs(),
            (low - close.shift(1)).abs(),
        ], axis=1).max(axis=1)
        atr = tr.rolling(atr_period).mean()
        atr_pct = (atr.iloc[-1] / last_close * 100) if pd.notna(atr.iloc[-1]) and last_close else 0
    else:
        atr_pct = 0

    bullish_alignment = last_close > last_sma20 > last_sma50
    bearish_alignment = last_close < last_sma20 < last_sma50

    if bullish_alignment and sma20_slope > 0 and price_vs_sma20 > 0.01:
        regime = "trending_up"
    elif bearish_alignment and sma20_slope < 0 and price_vs_sma20 < -0.01:
        regime = "trending_down"
    elif volatility_20 > 0.8:
        regime = "volatile"
    else:
        regime = "ranging"

    return {
        "regime": regime,
        "details": {
            "price_vs_sma20_pct": round(price_vs_sma20 * 100, 2),
            "price_vs_sma50_pct": round(price_vs_sma50 * 100, 2),
            "sma20_slope_pct": round(sma20_slope * 100, 2),
            "sma50_slope_pct": round(sma50_slope * 100, 2),
            "annualized_volatility_pct": round(volatility_20 * 100, 2),
            "atr_pct": round(atr_pct, 2),
            "volume_trend": round(volume_trend, 2),
            "regime": regime,
        },
    }


# ---------------------------------------------------------------------------
# Engine singleton
# ---------------------------------------------------------------------------

_lock = threading.Lock()

_state: dict = {
    "status": "idle",
    "phase": None,
    "progress_pct": 0.0,
    "current_job": "",
    "total_jobs": 0,
    "done_jobs": 0,
    "scan_count": 0,
    "holdout_count": 0,
    "error": None,
    "results": [],
    "summary": [],
    "no_go": [],
    "regimes": [],
    "run_id": None,
    "started_at": None,
    "completed_at": None,
}

_regimes: dict[str, dict] = {}


def get_status() -> dict:
    with _lock:
        return {
            "status": _state["status"],
            "phase": _state["phase"],
            "progress_pct": _state["progress_pct"],
            "current_job": _state["current_job"],
            "total_jobs": _state["total_jobs"],
            "done_jobs": _state["done_jobs"],
            "scan_count": _state["scan_count"],
            "holdout_count": _state["holdout_count"],
            "error": _state["error"],
            "run_id": _state["run_id"],
            "started_at": _state["started_at"],
            "completed_at": _state["completed_at"],
        }


def get_results() -> dict:
    with _lock:
        if _state["results"] or _state["summary"] or _state["no_go"]:
            return {
                "results": _state["results"],
                "summary": _state["summary"],
                "no_go": _state["no_go"],
            }
    return _load_latest_db_results()


def _load_latest_db_results() -> dict:
    try:
        db = SessionLocal()
        try:
            from sqlalchemy import select
            run = db.execute(
                select(SweepRun).order_by(SweepRun.created_at.desc())
            ).scalars().first()
            if run is None:
                return {"results": [], "summary": [], "no_go": []}
            return {
                "results": run.results or [],
                "summary": run.summary or [],
                "no_go": run.no_go or [],
            }
        finally:
            db.close()
    except Exception as exc:
        logger.error("No se pudo leer el último sweep de BD: %s", exc)
        return {"results": [], "summary": [], "no_go": []}


def get_regimes() -> dict:
    with _lock:
        return {"regimes": list(_regimes.values())}


def _update(**kwargs) -> None:
    with _lock:
        _state.update(kwargs)


def _is_cancelled() -> bool:
    with _lock:
        return _state.get("_cancelled", False)


# ---------------------------------------------------------------------------
# Phase 1: Import
# ---------------------------------------------------------------------------

def _import_data(symbols: list[str], timeframes: list[str], do_reset: bool) -> None:
    _update(phase="importing", progress_pct=0.0, current_job="Importando datos...")

    if do_reset:
        _update(current_job="Borrando datos existentes...")
        _delete_all_data_files()

    present = _get_data_pairs()
    expected = set(product(symbols, timeframes))
    missing = expected - present
    if not missing:
        _update(current_job=f"Universo completo ({len(present)}/{len(expected)} pares)")
        return

    sd = _start_date_6m()
    missing_symbols = sorted({s for s, _ in missing})
    batches = [missing_symbols[i:i + IMPORT_BATCH_SYMBOLS]
               for i in range(0, len(missing_symbols), IMPORT_BATCH_SYMBOLS)]

    for i, batch in enumerate(batches, 1):
        if _is_cancelled():
            return
        _update(current_job=f"Importando lote {i}/{len(batches)} ({len(batch)} símbolos)...")
        db = SessionLocal()
        try:
            batch_tfs = sorted({tf for s, tf in missing if s in batch})
            for symbol in batch:
                for tf in batch_tfs:
                    if _is_cancelled():
                        return
                    try:
                        download_symbol_timeframe(db, symbol, tf, sd)
                    except Exception as exc:
                        logger.warning("Import fallido %s %s: %s", symbol, tf, exc)
                    time.sleep(REQUEST_GAP_SEC)
        finally:
            db.close()

    final_pairs = _get_data_pairs()
    _update(
        current_job=f"Import completado: {len(final_pairs)} pares disponibles",
        progress_pct=5.0,
    )


# ---------------------------------------------------------------------------
# Phase 2: Sweep job worker
# ---------------------------------------------------------------------------

def _run_optimization_job(
    symbol: str,
    timeframe: str,
    strat_cfg: dict,
) -> tuple[list[dict], dict | None]:
    strat = strat_cfg["name"]
    df = _get_available_parquet(symbol, timeframe)
    if df is None or df.empty:
        return [], None

    strategy_obj = registry.get_by_name(strat)
    if strategy_obj is None:
        return [], None

    param_ranges_raw = strat_cfg["param_ranges"]
    param_ranges = _generate_param_ranges(param_ranges_raw)

    try:
        result = run_optimization(
            df, strategy_obj, param_ranges, EXIT_RULES, OOS_CONFIG,
            INITIAL_CAPITAL, COMMISSION_PCT, SLIPPAGE_PCT,
        )
    except Exception as exc:
        logger.warning("Optimization FAIL %s %s %s: %s", symbol, timeframe, strat, exc)
        return [], None

    candidates = result.get("candidates") or []
    robust = [c for c in candidates if c.get("verdict") == "robust"]

    summary = _dataset_summary(symbol, timeframe, strat, candidates)
    rows: list[dict] = []

    for cand in robust:
        params = cand["params"]
        try:
            confirm = _run_full_backtest(df, strategy_obj, params)
        except Exception as exc:
            logger.warning("Confirm FAIL %s %s %s: %s", symbol, timeframe, params, exc)
            continue

        row = {
            "symbol": symbol, "timeframe": timeframe, "strategy_name": strat,
            "params": _params_to_str(params),
            "is_pf": cand["is_metrics"].get("profit_factor"),
            "is_win_rate": cand["is_metrics"].get("win_rate"),
            "is_max_dd": cand["is_metrics"].get("max_drawdown"),
            "is_trades": cand["is_metrics"].get("total_trades"),
            "oos_pf": cand["oos_metrics"].get("profit_factor"),
            "oos_win_rate": cand["oos_metrics"].get("win_rate"),
            "oos_max_dd": cand["oos_metrics"].get("max_drawdown"),
            "oos_trades": cand["oos_metrics"].get("total_trades"),
            "degradation": cand.get("degradation"),
            "verdict": cand.get("verdict"),
            "confirm_net_profit": confirm.get("net_profit"),
            "confirm_profit_factor": confirm.get("profit_factor"),
            "confirm_win_rate": confirm.get("win_rate"),
            "confirm_max_dd": confirm.get("max_drawdown"),
            "confirm_trades": confirm.get("total_trades"),
            "holdout_pairs": "", "holdout_positives": 0,
            "holdout_avg_pf": 0, "holdout_net": 0,
            "generalized": False, "registered": "",
        }
        rows.append(row)

    return rows, summary


def _generate_param_ranges(param_ranges_raw: dict) -> dict:
    result: dict = {}
    for key, spec in param_ranges_raw.items():
        min_val = spec.get("min", 0)
        max_val = spec.get("max", 100)
        step = spec.get("step", 1)
        values: list = []
        current = min_val
        while current <= max_val + 0.0001:
            if spec.get("type") == "float":
                values.append(round(current, 4))
            else:
                values.append(int(current))
            current += step
        result[key] = values
    return result


def _run_full_backtest(df: pd.DataFrame, strategy: BaseStrategy, params: dict) -> dict:
    from app.core.backtest_engine import run_backtest
    result = run_backtest(df, strategy, params, EXIT_RULES, INITIAL_CAPITAL, COMMISSION_PCT, SLIPPAGE_PCT)
    return result["metrics"]


def _dataset_summary(symbol: str, timeframe: str, strat: str, candidates: list) -> dict:
    counts: dict[str, int] = {"failed": 0, "overfit": 0, "robust": 0}
    is_pfs: list = []
    oos_pfs: list = []
    oos_dds: list = []
    trades: list = []
    for c in candidates:
        verdict = c.get("verdict", "failed")
        counts[verdict] = counts.get(verdict, 0) + 1
        if c.get("is_metrics", {}).get("profit_factor") is not None:
            is_pfs.append(c["is_metrics"]["profit_factor"])
        if c.get("oos_metrics", {}).get("profit_factor") is not None:
            oos_pfs.append(c["oos_metrics"]["profit_factor"])
        if c.get("oos_metrics", {}).get("max_drawdown") is not None:
            oos_dds.append(c["oos_metrics"]["max_drawdown"])
        trades.append(int(c.get("oos_metrics", {}).get("total_trades", 0)))

    return {
        "symbol": symbol, "timeframe": timeframe, "strategy_name": strat,
        "n_total": len(candidates),
        "n_failed": counts["failed"],
        "n_overfit": counts["overfit"],
        "n_robust": counts["robust"],
        "mean_is_pf": _mean(is_pfs),
        "mean_oos_pf": _mean(oos_pfs),
        "mean_oos_dd": _mean(oos_dds),
        "median_trades": _median(trades),
    }


# ---------------------------------------------------------------------------
# Phase 3: Hold-out validation
# ---------------------------------------------------------------------------

def _is_scan_winner(row: dict) -> bool:
    if row.get("verdict") != "robust":
        return False
    if row.get("confirm_net_profit") is None or row.get("confirm_profit_factor") is None:
        return False
    try:
        if float(row["confirm_net_profit"]) <= WINNER_MIN_NET_PROFIT:
            return False
        if float(row["confirm_profit_factor"]) < WINNER_MIN_OOS_PF:
            return False
        if int(row["confirm_trades"]) < WINNER_MIN_TRADES:
            return False
    except (TypeError, ValueError):
        return False
    return True


def _validate_holdout(row: dict, holdout_symbols: list[str], available_pairs: set) -> None:
    tf = row["timeframe"]
    strategy_obj = registry.get_by_name(row["strategy_name"])
    if strategy_obj is None:
        return

    results: list[dict] = []
    holdout_pairs = [s for s in holdout_symbols if (s, tf) in available_pairs]

    for symbol in holdout_pairs:
        df = _get_available_parquet(symbol, tf)
        if df is None or df.empty:
            continue
        try:
            metrics = _run_full_backtest(df, strategy_obj, _parse_params(row["params"]))
            results.append({"net": metrics.get("net_profit") or 0.0, "pf": metrics.get("profit_factor")})
        except Exception as exc:
            logger.warning("Holdout FAIL %s %s: %s", symbol, tf, exc)

    positives = sum(1 for r in results if r["net"] > 0)
    pfs = [r["pf"] for r in results if r.get("pf") is not None]
    avg_pf = _mean(pfs) or 0.0

    row["holdout_pairs"] = ";".join(holdout_pairs)
    row["holdout_positives"] = len(results)
    row["holdout_avg_pf"] = avg_pf
    row["holdout_net"] = round(sum(r["net"] for r in results), 2)
    row["generalized"] = (
        len(results) >= GENERALIZED_MIN_POSITIVE
        and positives >= GENERALIZED_MIN_POSITIVE
        and avg_pf >= GENERALIZED_MIN_AVG_PF
    )


# ---------------------------------------------------------------------------
# Phase 4: No-Go report
# ---------------------------------------------------------------------------

def _write_no_go_report(summary_rows: list[dict]) -> list[dict]:
    groups: dict[tuple[str, str], list[dict]] = {}
    for s in summary_rows:
        key = (s["strategy_name"], s["timeframe"])
        groups.setdefault(key, []).append(s)

    rows: list[dict] = []
    for (strat, tf), items in sorted(groups.items()):
        n_total = sum(int(i["n_total"]) for i in items)
        rows.append({
            "strategy_name": strat,
            "timeframe": tf,
            "n_datasets": len(items),
            "n_total": n_total,
            "n_failed": sum(int(i["n_failed"]) for i in items),
            "n_overfit": sum(int(i["n_overfit"]) for i in items),
            "n_robust": sum(int(i["n_robust"]) for i in items),
            "pct_robust": round(sum(int(i["n_robust"]) for i in items) / n_total * 100, 2) if n_total else 0.0,
            "mean_is_pf": _mean([i["mean_is_pf"] for i in items if i["mean_is_pf"] is not None]),
            "mean_oos_pf": _mean([i["mean_oos_pf"] for i in items if i["mean_oos_pf"] is not None]),
            "mean_oos_dd": _mean([i["mean_oos_dd"] for i in items if i["mean_oos_dd"] is not None]),
            "median_trades": _median([i["median_trades"] for i in items if i["median_trades"] is not None]),
        })
    return rows


# ---------------------------------------------------------------------------
# Phase 5: Register generalized strategies
# ---------------------------------------------------------------------------

def _register_generalized(results: list[dict]) -> None:
    generalized = [r for r in results if str(r.get("generalized")).lower() == "true"]
    generalized.sort(key=lambda r: float(r["holdout_avg_pf"] or 0), reverse=True)
    logger.info("Registrando top %d generalizadas en portfolio...", min(MAX_REGISTER, len(generalized)))

    db = SessionLocal()
    try:
        for row in generalized[:MAX_REGISTER]:
            if _is_cancelled():
                return
            params = _parse_params(row["params"])
            name = f"AUTO_{row['strategy_name']}_{row['symbol']}_{row['timeframe']}_{_params_to_str(params)}"
            item = UserStrategy(
                name=name,
                is_active=False,
                base_strategy_name=row["strategy_name"],
                symbol=row["symbol"],
                timeframe=row["timeframe"],
                pattern_params=params,
                exit_rules=EXIT_RULES,
                risk_management={"type": "percent_risk", "value": 2.0},
            )
            db.add(item)
            db.commit()
            row["registered"] = name
            logger.info("  OK %s -> %s", name, item.id)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def _run_pipeline(
    reset: bool,
    timeframes: list[str],
    symbols: list[str],
) -> None:
    run_id = str(int(time.time()))
    _update(
        status="running",
        phase="init",
        progress_pct=0.0,
        current_job="Iniciando pipeline...",
        total_jobs=0,
        done_jobs=0,
        error=None,
        results=[],
        summary=[],
        no_go=[],
        run_id=run_id,
        started_at=datetime.now(timezone.utc).isoformat(),
        completed_at=None,
        _cancelled=False,
    )

    try:
        _import_data(symbols, timeframes, do_reset=reset)

        if _is_cancelled():
            _update(status="cancelled", phase="cancelled")
            return

        available = _get_data_pairs()
        random.seed(HOLDOUT_SEED)
        shuffled = sorted(symbols)
        random.shuffle(shuffled)
        holdout = sorted(shuffled[:HOLDOUT_COUNT])
        scan = sorted(shuffled[HOLDOUT_COUNT:])

        _update(
            phase="sweep",
            scan_count=len(scan),
            holdout_count=len(holdout),
            current_job=f"Sweep: {len(scan)} scan / {len(holdout)} holdout",
        )

        jobs: list[tuple[tuple[str, str], dict]] = []
        for symbol in scan:
            for tf in timeframes:
                if (symbol, tf) not in available:
                    continue
                for strat_cfg in STRATEGIES:
                    jobs.append(((symbol, tf), strat_cfg))

        total = len(jobs)
        _update(total_jobs=total, progress_pct=10.0)

        all_rows: list[dict] = []
        all_summary: list[dict] = []
        done = 0

        with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
            futures = {
                ex.submit(_run_optimization_job, pair[0], pair[1], cfg): (pair, cfg)
                for pair, cfg in jobs
            }
            for fut in as_completed(futures):
                if _is_cancelled():
                    ex.shutdown(wait=False, cancel_futures=True)
                    _update(status="cancelled", phase="cancelled")
                    return
                try:
                    rows, summary = fut.result()
                except Exception as exc:
                    logger.warning("FAIL job: %s", exc)
                    done += 1
                    _update(
                        done_jobs=done,
                        progress_pct=10.0 + (done / total * 70.0) if total else 80.0,
                    )
                    continue

                all_rows.extend(rows)
                if summary is not None:
                    all_summary.append(summary)
                done += 1
                _update(
                    done_jobs=done,
                    results=list(all_rows),
                    summary=list(all_summary),
                    progress_pct=10.0 + (done / total * 70.0) if total else 80.0,
                    current_job=f"Sweep {done}/{total}: {len(all_rows)} resultados",
                )

        if _is_cancelled():
            _update(status="cancelled", phase="cancelled")
            return

        _update(phase="holdout", progress_pct=82.0, current_job="Validación hold-out...")
        scan_winners = [r for r in all_rows if _is_scan_winner(r)]
        for row in scan_winners:
            if _is_cancelled():
                _update(status="cancelled", phase="cancelled")
                return
            _validate_holdout(row, holdout, available)

        _update(phase="reporting", progress_pct=90.0, current_job="Generando reporte no-go...")
        no_go_rows = _write_no_go_report(all_summary)

        _update(phase="registering", progress_pct=95.0, current_job="Registrando generalizadas en portfolio...")
        _register_generalized(all_rows)

        _save_run_csvs(run_id, all_rows, all_summary, no_go_rows)
        _persist_run(
            run_id=run_id,
            reset=reset,
            timeframes=timeframes,
            symbols=symbols,
            status="completed",
            results=all_rows,
            summary=all_summary,
            no_go=no_go_rows,
            output_dir=os.path.join(SWEEP_OUTPUT_DIR, run_id),
            error=None,
        )

        _update(
            status="completed",
            phase="completed",
            progress_pct=100.0,
            current_job=f"Completado: {len(all_rows)} filas, {len(scan_winners)} ganadoras barrido",
            results=list(all_rows),
            summary=list(all_summary),
            no_go=no_go_rows,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
    except Exception as exc:
        logger.error("Sweep pipeline failed: %s", exc, exc_info=True)
        _persist_run(
            run_id=run_id,
            reset=reset,
            timeframes=timeframes,
            symbols=symbols,
            status="failed",
            results=[],
            summary=[],
            no_go=[],
            output_dir=None,
            error=str(exc),
        )
        _update(status="failed", error=str(exc), phase="failed")


def _persist_run(
    run_id: str,
    reset: bool,
    timeframes: list[str],
    symbols: list[str],
    status: str,
    results: list[dict],
    summary: list[dict],
    no_go: list[dict],
    output_dir: str | None,
    error: str | None,
) -> None:
    try:
        db = SessionLocal()
        try:
            run = SweepRun(
                run_id=run_id,
                status=status,
                reset=reset,
                timeframes=timeframes,
                symbols=symbols,
                results=results,
                summary=summary,
                no_go=no_go,
                output_dir=output_dir,
                error=error,
                completed_at=datetime.now(timezone.utc) if status == "completed" else None,
            )
            db.add(run)
            db.commit()
            logger.info("Sweep %s persistido en BD (run_id=%s)", status, run_id)
        finally:
            db.close()
    except Exception as exc:
        logger.error("No se pudo persistir el sweep %s en BD: %s", run_id, exc)


def _save_run_csvs(run_id: str, results: list[dict], summary: list[dict], no_go: list[dict]) -> None:
    run_dir = os.path.join(SWEEP_OUTPUT_DIR, run_id)
    os.makedirs(run_dir, exist_ok=True)

    import csv
    for fname, rows, fields in [
        ("results.csv", results, FIELDNAMES_RESULTS),
        ("summary.csv", summary, FIELDNAMES_SUMMARY),
        ("no_go.csv", no_go, [
            "strategy_name", "timeframe", "n_datasets",
            "n_total", "n_failed", "n_overfit", "n_robust", "pct_robust",
            "mean_is_pf", "mean_oos_pf", "mean_oos_dd", "median_trades",
        ]),
    ]:
        path = os.path.join(run_dir, fname)
        with open(path, "w", encoding="utf-8", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def start_sweep(reset: bool, timeframes: list[str], symbols: list[str]) -> str | None:
    with _lock:
        if _state["status"] == "running":
            return None
        _state["_cancelled"] = False

    thread = threading.Thread(target=_run_pipeline, args=(reset, timeframes, symbols), daemon=True)
    thread.start()
    with _lock:
        return _state.get("run_id")


def cancel_sweep() -> bool:
    with _lock:
        if _state["status"] != "running":
            return False
        _state["_cancelled"] = True
    return True


def run_market_regime_analysis(symbols: list[str], timeframes: list[str]) -> list[dict]:
    results: list[dict] = []
    for symbol in symbols:
        for tf in timeframes:
            df = _get_available_parquet(symbol, tf)
            if df is None or df.empty:
                results.append({
                    "symbol": symbol, "timeframe": tf,
                    "regime": "no_data", "details": {},
                })
                continue
            regime_info = analyze_market_regime(df)
            entry = {
                "symbol": symbol, "timeframe": tf,
                **regime_info,
            }
            results.append(entry)
            key = f"{symbol}_{tf}"
            with _lock:
                _regimes[key] = entry

    return results
