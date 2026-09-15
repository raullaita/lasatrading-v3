#!/usr/bin/env python3
"""mass_sweep.py — Barrido masivo "a lo bruto" con validación anti-data-snooping.

Universo: 50 símbolos (GET /api/v1/data/symbols) x 6 timeframes x 13 estrategias.
Histórico: 6 meses (START_DATE = hoy - 6M). Cohorte homogénea.

Pipeline:
  F0) Import 6M: por defecto SOLO importa lo que falta (resume). Con --reset
      borra TODOS los archivos de /data/status (cohorte uniforme) tras
      confirmacion explicita en terminal.
  F1) Import: lotes de simbolos via POST /api/v1/data/import (con pacing en
      binance_client.py) esperando a que cada (symbol, timeframe) aparezca.
  F2) Sweep 45 simbolos (5 hold-out reservados): (symbol x tf x estrategia) ->
      POST /api/v1/optimizer/run (grid coarse) -> polling /status.
  F3) Confirm full-window en el simbolo de barrido (net_profit real).
  F4) Validacion hold-out: solo las ganadoras de barrido -> confirm en los 5
      simbolos hold-out. Generaliza si net_profit>0 en >=3/5 y PF medio >= 1.0.
  F5) Salidas: mass_sweep_results.csv (barrido completo + holdout), 
      mass_sweep_summary.csv (veredictos por dataset), no_go_report.csv
      ("que NO hacer"), y registro de top ganadoras validadas en portfolio
      (is_active=false).

Ejecutar manualmente: python mass_sweep.py
"""

import argparse
import csv
import os
import random
import re
import statistics
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from itertools import product

import httpx

BASE_URL = "http://localhost:8000"
POLL_INTERVAL_SEC = 2.0
REQUEST_GAP_SEC = 1.0
DATA_POLL_SEC = 10.0
MAX_POLL_SEC = 600
MAX_IMPORT_WAIT_SEC = 2400
TIMEOUT = (5, 120)
CONCURRENCY = 4

HISTORY_DAYS = 183          # 6 meses
IMPORT_BATCH_SYMBOLS = 20
HOLDOUT_COUNT = 5
HOLDOUT_SEED = 42
TIMEFRAMES = ["5m", "15m", "30m", "1h", "4h", "1d"]

OUT_CSV = "mass_sweep_results.csv"
OUT_SUMMARY = "mass_sweep_summary.csv"
OUT_NOGO = "no_go_report.csv"

# Exit rules fijos (SL atr_multiplier 1.5 / TP risk_reward 2.0)
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

# Todas las 13 estrategias con grid coarse (~53 combos/dataset).
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
    # --- Patrones nuevos incorporados tras el primer barrido (1h/4h) ---
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

GENERALIZED_MIN_POSITIVE = 3   # de HOLDOUT_COUNT
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

_print_lock = threading.Lock()


def log(msg: str) -> None:
    with _print_lock:
        print(msg, flush=True)


# ---------------------------------------------------------------------- HTTP

def _get(path: str):
    r = httpx.get(f"{BASE_URL}{path}", timeout=TIMEOUT)
    r.raise_for_status()
    return r.json() if r.content else None


def _post(path: str, payload: dict):
    r = httpx.post(f"{BASE_URL}{path}", json=payload, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json() if r.content else None


def _delete(path: str):
    r = httpx.delete(f"{BASE_URL}{path}", timeout=TIMEOUT)
    r.raise_for_status()
    return r.json() if r.content else None


def get_symbols() -> list[str]:
    return list(_get("/api/v1/data/symbols") or [])


def get_data_pairs() -> set[tuple[str, str]]:
    rows = _get("/api/v1/data/status") or []
    return {(r["symbol"], r["timeframe"]) for r in rows}

# ---------------------------------------------------------------------- helpers

def params_to_str(params: dict) -> str:
    return "|".join(f"{k}={v}" for k, v in params.items())


def parse_params(s: str) -> dict:
    out = {}
    for pair in s.split("|"):
        k, v = pair.split("=")
        out[k] = float(v) if re.match(r"^-?\d+\.\d+$", v) else int(v)
    return out


def start_date_6m() -> str:
    return (datetime.now(timezone.utc) - timedelta(days=HISTORY_DAYS)).strftime("%Y-%m-%d")


# ---------------------------------------------------------------------- polling / ejecución

def poll_optimizer(task_id: str) -> dict:
    start = time.monotonic()
    while time.monotonic() - start < MAX_POLL_SEC:
        try:
            st = _get(f"/api/v1/optimizer/status/{task_id}")
        except httpx.HTTPError as exc:
            log(f"  [warn] polling optimizer {task_id}: {exc}")
            time.sleep(POLL_INTERVAL_SEC)
            continue
        status = st.get("status")
        if status == "completed":
            return _get(f"/api/v1/optimizer/results/{task_id}") or {}
        if status in ("failed", "cancelled"):
            raise RuntimeError(f"optimizer {task_id} -> {status}: {st.get('error')}")
        time.sleep(POLL_INTERVAL_SEC)
    raise TimeoutError(f"optimizer {task_id} sin terminar en {MAX_POLL_SEC}s")


def run_confirm(symbol: str, timeframe: str, strategy_name: str, params: dict) -> dict:
    payload = {
        "symbol": symbol, "timeframe": timeframe, "strategy_name": strategy_name,
        "strategy_params": params, "exit_rules": EXIT_RULES,
        "initial_capital": INITIAL_CAPITAL,
        "commission_pct": COMMISSION_PCT, "slippage_pct": SLIPPAGE_PCT,
    }
    task_id = _post("/api/v1/backtest/run", payload)["task_id"]
    start = time.monotonic()
    while time.monotonic() - start < MAX_POLL_SEC:
        try:
            res = _get(f"/api/v1/backtest/results/{task_id}")
        except httpx.HTTPError as exc:
            log(f"  [warn] polling confirm {task_id}: {exc}")
            time.sleep(POLL_INTERVAL_SEC)
            continue
        status = res.get("status")
        if status == "completed":
            return res["metrics"]
        if status in ("error", "failed"):
            raise RuntimeError(f"confirm backtest {task_id} -> {status}: {res.get('detail')}")
        time.sleep(POLL_INTERVAL_SEC)
    raise TimeoutError(f"confirm backtest {task_id} sin terminar")


# ---------------------------------------------------------------------- Fase 0/1: datos

def reset_and_import(symbols: list[str], do_reset: bool = False) -> None:
    """Borra (SOLO con --reset) e importa el universo con 6M.

    Por defecto NO borra nada: solo importa los pares que falten (resume).
    El borrado requiere `do_reset=True`, que en main ya pide confirmacion.
    """
    present = get_data_pairs()
    if do_reset and present:
        rows = _get("/api/v1/data/status") or []
        log(f"[F0] Reset 6M: borrando {len(rows)} archivos existentes ...")
        for r in rows:
            try:
                _delete(f"/api/v1/data/{r['id']}")
            except Exception as exc:
                log(f"  [warn] no se pudo borrar {r['symbol']} {r['timeframe']}: {exc}")
            time.sleep(REQUEST_GAP_SEC)
        present = set()

    expected = set(product(symbols, TIMEFRAMES))
    missing = expected - present
    if not missing:
        log(f"[F0] Universo completo ({len(present)}/{len(expected)} pares). "
            "Nada que importar.")
        return

    sd = start_date_6m()
    missing_symbols = sorted({s for s, _ in missing})
    batches = [missing_symbols[i:i + IMPORT_BATCH_SYMBOLS]
               for i in range(0, len(missing_symbols), IMPORT_BATCH_SYMBOLS)]
    log(f"[F1] Import 6M (start_date={sd}): {len(missing)} pares pendientes "
        f"({len(missing_symbols)} simbolos, {len(batches)} lotes) ...")
    for i, batch in enumerate(batches, 1):
        batch_tfs = sorted({tf for s, tf in missing if s in batch})
        batch_pairs = set(product(batch, batch_tfs))
        _post("/api/v1/data/import", {
            "symbols": batch, "timeframes": batch_tfs,
            "start_date": sd, "source": "binance",
        })
        log(f"  lote {i}/{len(batches)} ({len(batch)} simbolos) encolado, esperando datos ...")
        _wait_for_pairs(batch_pairs, f"lote {i}")


def _wait_for_pairs(expected: set[tuple[str, str]], label: str) -> None:
    deadline = time.monotonic() + MAX_IMPORT_WAIT_SEC
    while time.monotonic() < deadline:
        present = get_data_pairs()
        missing = expected - present
        if not missing:
            log(f"  lote {label}: completo ({len(expected)} pares)")
            time.sleep(3)   # margen para que terminen las ultimas paginas
            return
        log(f"  lote {label}: esperando {len(missing)} pares ...")
        time.sleep(DATA_POLL_SEC)
    log(f"  [warn] lote {label}: timeout; continuo con lo disponible")


# ---------------------------------------------------------------------- Fase 2-4: sweep + validación

def run_sweep_job(ctx: str, pair: tuple[str, str], strat_cfg: dict, seen_keys: set) -> tuple[list[dict], dict | None]:
    symbol, timeframe = pair
    strat = strat_cfg["name"]
    key = (symbol, timeframe, strat)
    if key in seen_keys:
        return [], None

    time.sleep(REQUEST_GAP_SEC)
    try:
        resp = _post("/api/v1/optimizer/run", {
            "symbol": symbol, "timeframe": timeframe, "strategy_name": strat,
            "param_ranges": strat_cfg["param_ranges"],
            "exit_rules": EXIT_RULES, "oos_config": OOS_CONFIG,
            "initial_capital": INITIAL_CAPITAL,
            "commission_pct": COMMISSION_PCT, "slippage_pct": SLIPPAGE_PCT,
        })
        task_id = resp["task_id"]
        result = poll_optimizer(task_id)
        candidates = result.get("candidates") or []
    except Exception as exc:
        log(f"[{ctx}] FAIL optimizer {symbol} {timeframe} {strat}: {type(exc).__name__}: {exc}")
        return [], None

    summary = _dataset_summary(symbol, timeframe, strat, candidates)
    rows = []
    robust = [c for c in candidates if c.get("verdict") == "robust"]
    log(f"[{ctx}] {symbol} {timeframe} {strat}: {len(candidates)} cand, "
        f"{len(robust)} robustos (failed={summary['n_failed']}, overfit={summary['n_overfit']})")

    confirmed = 0
    for cand in robust:
        params = cand["params"]
        time.sleep(REQUEST_GAP_SEC)
        try:
            confirm = run_confirm(symbol, timeframe, strat, params)
        except Exception as exc:
            log(f"[{ctx}] FAIL confirm {symbol} {timeframe} {strat} {params_to_str(params)}: "
                f"{type(exc).__name__}: {exc}")
            continue
        row = {
            "symbol": symbol, "timeframe": timeframe, "strategy_name": strat,
            "params": params_to_str(params),
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
            "registered": "",
        }
        rows.append(row)
        confirmed += 1
        if is_scan_winner(cand, confirm):
            log(f"[{ctx}] * GANADORA barrido {symbol} {timeframe} {strat} "
                f"{params_to_str(params)} net={confirm['net_profit']} PF={confirm['profit_factor']}")

    return rows, summary


def _dataset_summary(symbol: str, timeframe: str, strat: str, candidates: list) -> dict:
    counts = {"failed": 0, "overfit": 0, "robust": 0}
    is_pfs, oos_pfs, oos_dds, trades = [], [], [], []
    for c in candidates:
        verdict = c.get("verdict", "failed")
        counts[verdict] = counts.get(verdict, 0) + 1
        if c.get("is_metrics", {}).get("profit_factor") is not None:
            is_pfs.append(float(c["is_metrics"]["profit_factor"]))
        if c.get("oos_metrics", {}).get("profit_factor") is not None:
            oos_pfs.append(float(c["oos_metrics"]["profit_factor"]))
        if c.get("oos_metrics", {}).get("max_drawdown") is not None:
            oos_dds.append(float(c["oos_metrics"]["max_drawdown"]))
        trades.append(int(c.get("oos_metrics", {}).get("total_trades", 0)))
    return {
        "symbol": symbol, "timeframe": timeframe, "strategy_name": strat,
        "n_total": len(candidates),
        "n_failed": counts["failed"], "n_overfit": counts["overfit"], "n_robust": counts["robust"],
        "mean_is_pf": _mean(is_pfs), "mean_oos_pf": _mean(oos_pfs),
        "mean_oos_dd": _mean(oos_dds),
        "median_trades": _median(trades),
    }


def _mean(vals: list) -> float:
    nums = []
    for v in vals:
        try:
            if v is not None and v != "":
                nums.append(float(v))
        except (TypeError, ValueError):
            continue
    return round(statistics.mean(nums), 4) if nums else None


def _median(vals: list) -> float:
    nums = []
    for v in vals:
        try:
            if v is not None and v != "":
                nums.append(float(v))
        except (TypeError, ValueError):
            continue
    return statistics.median(nums) if nums else None


def is_scan_winner(cand: dict, confirm: dict) -> bool:
    if cand.get("verdict") != "robust":
        return False
    if (cand.get("oos_metrics", {}).get("profit_factor") or 0) < WINNER_MIN_OOS_PF:
        return False
    if not confirm or (confirm.get("net_profit") or 0) <= WINNER_MIN_NET_PROFIT:
        return False
    if (confirm.get("total_trades") or 0) < WINNER_MIN_TRADES:
        return False
    return True


def validate_holdout(row: dict, holdout_symbols: list[str], available_pairs: set) -> None:
    """Confirma la combinacion ganadora en los simbolos hold-out (mismo tf)."""
    tf = row["timeframe"]
    results = []
    holdout_pairs = [s for s in holdout_symbols if (s, tf) in available_pairs]
    for symbol in holdout_pairs:
        time.sleep(REQUEST_GAP_SEC)
        try:
            metrics = run_confirm(symbol, tf, row["strategy_name"], parse_params(row["params"]))
            net = metrics.get("net_profit")
            pf = metrics.get("profit_factor")
            results.append({"net": net or 0.0, "pf": pf})
        except Exception as exc:
            log(f"  [warn] holdout {symbol} {tf}: {type(exc).__name__}: {exc}")

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
    log(f"    holdout {tf}: {positives}/{len(results)} positivos, PF medio {avg_pf} "
        f"-> {'GENERALIZA' if row['generalized'] else 'no generaliza'}")


# ---------------------------------------------------------------------- registro

def register_portfolio(symbol: str, timeframe: str, strat: str, params: dict) -> dict:
    payload = {
        "name": f"AUTO_{strat}_{symbol}_{timeframe}_{params_to_str(params)}",
        "base_strategy_name": strat,
        "symbol": symbol,
        "timeframe": timeframe,
        "pattern_params": params,
        "exit_rules": EXIT_RULES,
        "risk_management": {"type": "percent_risk", "value": 2.0},
        "is_active": False,
    }
    return _post("/api/v1/portfolio/strategies", payload)


# ---------------------------------------------------------------------- CSV I/O

def load_rows(path: str, fieldnames: list[str]) -> tuple[list[dict], set]:
    rows = []
    seen = set()
    keyed = []
    try:
        with open(path, encoding="utf-8", newline="") as fh:
            reader = csv.DictReader(fh)
            if reader.fieldnames == fieldnames:
                for r in reader:
                    rows.append(r)
                    keyed.append(tuple(r[k] for k in fieldnames))
    except FileNotFoundError:
        return rows, set()
    return rows, set(keyed)


def append_rows(path: str, rows: list[dict], fieldnames: list[str]) -> None:
    if not rows:
        return
    new_file = not os.path.exists(path)
    with open(path, "a", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        if new_file:
            writer.writeheader()
        writer.writerows(rows)


# ---------------------------------------------------------------------- reportes

def write_no_go_report(summary_rows: list[dict]) -> None:
    groups: dict[tuple, list[dict]] = {}
    for s in summary_rows:
        groups.setdefault((s["strategy_name"], s["timeframe"]), []).append(s)

    fieldnames = [
        "strategy_name", "timeframe", "n_datasets",
        "n_total", "n_failed", "n_overfit", "n_robust", "pct_robust",
        "mean_is_pf", "mean_oos_pf", "mean_oos_dd", "median_trades",
    ]
    with open(OUT_NOGO, "w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for (strat, tf), items in sorted(groups.items()):
            n_total = sum(int(i["n_total"]) for i in items)
            writer.writerow({
                "strategy_name": strat, "timeframe": tf,
                "n_datasets": len(items), "n_total": n_total,
                "n_failed": sum(int(i["n_failed"]) for i in items),
                "n_overfit": sum(int(i["n_overfit"]) for i in items),
                "n_robust": sum(int(i["n_robust"]) for i in items),
                "pct_robust": round(sum(int(i["n_robust"]) for i in items) / n_total * 100, 2) if n_total else 0.0,
                "mean_is_pf": _mean([i["mean_is_pf"] for i in items if i["mean_is_pf"] is not None]),
                "mean_oos_pf": _mean([i["mean_oos_pf"] for i in items if i["mean_oos_pf"] is not None]),
                "mean_oos_dd": _mean([i["mean_oos_dd"] for i in items if i["mean_oos_dd"] is not None]),
                "median_trades": _median([i["median_trades"] for i in items if i["median_trades"] is not None]),
            })
    log(f"[NO-GO] {OUT_NOGO} generado.")


# ---------------------------------------------------------------------- main

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Barrido masivo IS/OOS con validacion hold-out (6M).",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Borrar TODOS los archivos del universo e importar 6M desde cero "
             "(pide confirmacion). Sin esta flag NO se borra nada.",
    )
    args = parser.parse_args()

    if args.reset:
        present = get_data_pairs()
        if present:
            print(f"  ATENCION: se borraran {len(present)} archivos de datos e "
                  "se reimportaran 6M desde cero.")
            answer = input("  Escribe RESET para confirmar (cualquier otra cosa cancela): ")
            if answer.strip().upper() != "RESET":
                print("  Cancelado.")
                sys.exit(1)
        else:
            print("[F0] No hay archivos que borrar; se importara el universo 6M.")

    symbols = get_symbols()
    if not symbols:
        print("No se pudo obtener lista de simbolos. ¿API levantada? Saliendo.")
        sys.exit(1)

    random.seed(HOLDOUT_SEED)
    shuffled = sorted(symbols)
    random.shuffle(shuffled)
    holdout = sorted(shuffled[:HOLDOUT_COUNT])
    scan = sorted(shuffled[HOLDOUT_COUNT:])
    print(f"[U] Universo {len(symbols)} simbolos -> SCAN {len(scan)} / HOLDOUT {len(holdout)}")
    print(f"    holdout: {holdout}")

    reset_and_import(symbols, do_reset=args.reset)
    available = get_data_pairs()
    print(f"[D] Datos disponibles: {len(available)} pares")

    # Resume: los datasets ya barridos se deducen del CSV de RESUMEN
    # (contiene una fila por cada (symbol, timeframe, estrategia) procesado),
    # no del CSV de resultados, que solo guarda candidatos confirmados.
    all_rows, _ = load_rows(OUT_CSV, FIELDNAMES_RESULTS)
    summary_rows, _ = load_rows(OUT_SUMMARY, FIELDNAMES_SUMMARY)
    seen_keys = {(r["symbol"], r["timeframe"], r["strategy_name"]) for r in summary_rows}
    print(f"[R] Resume: {len(all_rows)} filas resultados, "
          f"{len(summary_rows)} datasets ya barridos")

    jobs = []
    for symbol in scan:
        for tf in TIMEFRAMES:
            if (symbol, tf) not in available:
                continue
            for strat_cfg in STRATEGIES:
                jobs.append(((symbol, tf), strat_cfg))
    total = len(jobs)
    print(f"[S] Jobs de barrido: {total} (sobre pares disponibles)")

    done = 0

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        futures = {
            ex.submit(run_sweep_job, f"{i + 1}/{total}", pair, cfg, seen_keys): cfg
            for i, (pair, cfg) in enumerate(jobs)
        }
        for fut in as_completed(futures):
            try:
                rows, summary = fut.result()
            except Exception as exc:
                log(f"FAIL job: {type(exc).__name__}: {exc}")
                continue
            all_rows.extend(rows)
            done += 1
            if summary is not None:
                append_rows(OUT_SUMMARY, [summary], FIELDNAMES_SUMMARY)
            if rows:
                append_rows(OUT_CSV, rows, FIELDNAMES_RESULTS)
            log(f"[progress] {done}/{total} jobs, {len(all_rows)} filas")

    summary_rows = load_rows(OUT_SUMMARY, FIELDNAMES_SUMMARY)[0]

    # Validacion hold-out sobre ganadoras de barrido
    scan_winners = [r for r in all_rows if is_scan_winner_of_row(r)]
    print(f"\n[H] {len(scan_winners)} ganadoras de barrido -> validacion hold-out ...")
    for row in scan_winners:
        validate_holdout(row, holdout, available)
        time.sleep(REQUEST_GAP_SEC)

    write_no_go_report(summary_rows)

    # Registro de generalizadas
    generalized = [r for r in all_rows if str(r.get("generalized")).lower() == "true"]
    generalized.sort(key=lambda r: float(r["holdout_avg_pf"] or 0), reverse=True)
    print(f"\n[P] Generalizadas ({len(generalized)}): registrando top {MAX_REGISTER} (is_active=false) ...")
    for row in generalized[:MAX_REGISTER]:
        time.sleep(REQUEST_GAP_SEC)
        try:
            created = register_portfolio(
                row["symbol"], row["timeframe"], row["strategy_name"],
                parse_params(row["params"]),
            )
            row["registered"] = created.get("id") or "YES"
            log(f"  OK {row['strategy_name']} {row['symbol']} {row['timeframe']} "
                f"-> {row['registered']}")
        except Exception as exc:
            log(f"  FAIL registro {row['strategy_name']} {row['symbol']}: "
                f"{type(exc).__name__}: {exc}")

    # Reescritura final con registered
    with open(OUT_CSV, "w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDNAMES_RESULTS)
        writer.writeheader()
        writer.writerows(all_rows)

    print(f"\n[DONE] {len(all_rows)} filas en {OUT_CSV} | resumen en {OUT_SUMMARY} | {OUT_NOGO}")
    if generalized:
        print("GENERALIZADAS:")
        for r in generalized[:MAX_REGISTER]:
            print(f"  {r['strategy_name']} {r['symbol']} {r['timeframe']} "
                  f"params={r['params']} holdout_net={r['holdout_net']}")


def is_scan_winner_of_row(row: dict) -> bool:
    if row.get("verdict") != "robust":
        return False
    if row.get("confirm_net_profit") is None or row.get("confirm_profit_factor") is None:
        return False
    if float(row["confirm_net_profit"]) <= WINNER_MIN_NET_PROFIT:
        return False
    if float(row["confirm_profit_factor"]) < WINNER_MIN_OOS_PF:
        return False
    if int(row["confirm_trades"]) < WINNER_MIN_TRADES:
        return False
    return True


if __name__ == "__main__":
    main()