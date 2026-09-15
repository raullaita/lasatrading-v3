#!/usr/bin/env python3
"""strategy_optimizer.py — Búsqueda sistemática de estrategias ROBUSTAS (IS/OOS).

Pipeline:
  A) GET  /api/v1/data/status                 -> pares symbol/timeframe con datos
  B) GET  /api/v1/strategies/catalog          -> (validación; no bloqueante)
  C) POST /api/v1/optimizer/run (por par x estrategia, CONCURRENCY en paralelo)
  D) Polling GET /api/v1/optimizer/status/{task_id} cada POLL_INTERVAL_SEC
  E) GET  /api/v1/optimizer/results/{task_id} -> candidatos "robust"
  F) Confirmar top robustos con POST /api/v1/backtest/run (ventana completa)
  G) accuracy optimization_results.csv (todas las filas) + registrar ganadoras
     en portfolio via POST /api/v1/portfolio/strategies (is_active=false).
"""

import csv
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import httpx

BASE_URL = "http://localhost:8000"
POLL_INTERVAL_SEC = 2.0
REQUEST_GAP_SEC = 1.0
MAX_POLL_SEC = 600
TIMEOUT = (5, 120)
CONCURRENCY = 3                      # tasks de optimización en paralelo
OUT_CSV = "optimization_results.csv"

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

# Estrategias y rangos (respetan min/max de cada parameters_schema).
# golden_cross excluido: drawdown estructural medido en pruebas previas.
STRATEGIES = [
    {"name": "ema_crossover", "param_ranges": {
        "FAST_EMA": {"type": "int", "min": 5, "max": 40, "step": 5},
        "SLOW_EMA": {"type": "int", "min": 20, "max": 120, "step": 10}}},
    {"name": "macd_crossover", "param_ranges": {
        "FAST_PERIOD": {"type": "int", "min": 5, "max": 30, "step": 5},
        "SLOW_PERIOD": {"type": "int", "min": 15, "max": 60, "step": 5},
        "SIGNAL_PERIOD": {"type": "int", "min": 5, "max": 20, "step": 5}}},
    {"name": "rsi_ob_os", "param_ranges": {
        "RSI_PERIOD": {"type": "int", "min": 5, "max": 30, "step": 5},
        "OVERSOLD": {"type": "float", "min": 15, "max": 35, "step": 5},
        "OVERBOUGHT": {"type": "float", "min": 65, "max": 85, "step": 5}}},
    {"name": "stochastic", "param_ranges": {
        "K_PERIOD": {"type": "int", "min": 5, "max": 30, "step": 5},
        "D_PERIOD": {"type": "int", "min": 2, "max": 10, "step": 2}}},
    {"name": "atr_breakout", "param_ranges": {
        "ATR_PERIOD": {"type": "int", "min": 5, "max": 30, "step": 5},
        "ATR_MULTIPLIER": {"type": "float", "min": 1.5, "max": 3.5, "step": 0.5}}},
    {"name": "bollinger_bounce", "param_ranges": {
        "PERIOD": {"type": "int", "min": 10, "max": 40, "step": 5},
        "NUM_STD": {"type": "float", "min": 1.5, "max": 3.0, "step": 0.5}}},
    {"name": "price_channel", "param_ranges": {
        "PERIOD": {"type": "int", "min": 10, "max": 60, "step": 10}}},
    {"name": "volume_spike", "param_ranges": {
        "LOOKBACK": {"type": "int", "min": 10, "max": 50, "step": 10},
        "MULTIPLIER": {"type": "float", "min": 1.5, "max": 3.0, "step": 0.5}}},
]

WINNER_MIN_OOS_PF = 1.3
WINNER_MIN_NET_PROFIT = 0.0
WINNER_MIN_TRADES = 20
MAX_CONFIRM_PER_TASK = 5   # confirmaciones por task para acotar el tiempo
MAX_REGISTER = 5           # cuántas ganadoras auto-registrar en portfolio

FIELDNAMES = [
    "symbol", "timeframe", "strategy_name", "params",
    "is_pf", "is_win_rate", "is_max_dd", "is_trades",
    "oos_pf", "oos_win_rate", "oos_max_dd", "oos_trades",
    "degradation", "verdict",
    "confirm_net_profit", "confirm_profit_factor",
    "confirm_win_rate", "confirm_max_dd", "confirm_trades",
    "registered",
]

_print_lock = threading.Lock()
_progress_lock = threading.Lock()


def log(msg: str) -> None:
    with _print_lock:
        print(msg, flush=True)


# ---------------------------------------------------------------------- HTTP helpers

def _get(path: str):
    r = httpx.get(f"{BASE_URL}{path}", timeout=TIMEOUT)
    r.raise_for_status()
    return r.json() if r.content else None


def _post(path: str, payload: dict):
    r = httpx.post(f"{BASE_URL}{path}", json=payload, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json() if r.content else None


def get_available_data() -> list[dict]:
    return [
        {"symbol": row["symbol"], "timeframe": row["timeframe"]}
        for row in _get("/api/v1/data/status")
        if row.get("freshness_status") != "missing"
    ]


def params_to_str(params: dict) -> str:
    return "|".join(f"{k}={v}" for k, v in params.items())


def parse_params(s: str) -> dict:
    out = {}
    for pair in s.split("|"):
        k, v = pair.split("=")
        out[k] = float(v) if re.match(r"^-?\d+\.\d+$", v) else int(v)
    return out


# ---------------------------------------------------------------------- polling

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
            res = _get(f"/api/v1/optimizer/results/{task_id}")
            return res or {}
        if status in ("failed", "cancelled"):
            raise RuntimeError(f"optimizer {task_id} -> {status}: {st.get('error')}")
        time.sleep(POLL_INTERVAL_SEC)
    raise TimeoutError(f"optimizer {task_id} sin terminar en {MAX_POLL_SEC}s")


def confirm_backtest(symbol: str, timeframe: str, strategy_name: str,
                     params: dict) -> dict:
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


# ---------------------------------------------------------------------- job worker

def run_job(ctx: str, pair: dict, strat_cfg: dict, seen_keys: set) -> list[dict]:
    sym, tf = pair["symbol"], pair["timeframe"]
    strat = strat_cfg["name"]
    key = (sym, tf, strat)
    if key in seen_keys:
        log(f"  skip (ya escaneado) {sym} {tf} {strat}")
        return []

    time.sleep(REQUEST_GAP_SEC)
    try:
        resp = _post("/api/v1/optimizer/run", {
            "symbol": sym, "timeframe": tf, "strategy_name": strat,
            "param_ranges": strat_cfg["param_ranges"],
            "exit_rules": EXIT_RULES, "oos_config": OOS_CONFIG,
            "initial_capital": INITIAL_CAPITAL,
            "commission_pct": COMMISSION_PCT, "slippage_pct": SLIPPAGE_PCT,
        })
        task_id = resp["task_id"]
        log(f"[{ctx}] {sym} {tf} {strat}: encolada combos={resp['total_combinations']}")
        result = poll_optimizer(task_id)
        candidates = result.get("candidates") or []
        robust = [c for c in candidates if c.get("verdict") == "robust"]
        log(f"[{ctx}] {sym} {tf} {strat}: {len(candidates)} candidatos, {len(robust)} robustos")
    except Exception as exc:
        log(f"[{ctx}] FAIL optimizer {sym} {tf} {strat}: {type(exc).__name__}: {exc}")
        return []

    rows = []
    for cand in robust[:MAX_CONFIRM_PER_TASK]:
        params = cand["params"]
        time.sleep(REQUEST_GAP_SEC)
        try:
            confirm = confirm_backtest(sym, tf, strat, params)
        except Exception as exc:
            log(f"[{ctx}] FAIL confirm {sym} {tf} {strat} {params_to_str(params)}: "
                f"{type(exc).__name__}: {exc}")
            continue
        row = {
            "symbol": sym, "timeframe": tf, "strategy_name": strat,
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
        if is_winner(cand, confirm):
            log(f"[{ctx}] * GANADORA {sym} {tf} {strat} {params_to_str(params)} "
                f"net={confirm['net_profit']} PF={confirm['profit_factor']}")
    return rows


def is_winner(cand: dict, confirm: dict) -> bool:
    if cand.get("verdict") != "robust":
        return False
    if (cand.get("oos_metrics", {}).get("profit_factor") or 0) < WINNER_MIN_OOS_PF:
        return False
    if not confirm or (confirm.get("net_profit") or 0) <= WINNER_MIN_NET_PROFIT:
        return False
    if (confirm.get("total_trades") or 0) < WINNER_MIN_TRADES:
        return False
    return True


# ---------------------------------------------------------------------- CSV I/O

def load_existing_rows() -> tuple[list[dict], set]:
    rows: list[dict] = []
    seen: set = set()
    try:
        with open(OUT_CSV, encoding="utf-8", newline="") as fh:
            reader = csv.DictReader(fh)
            if reader.fieldnames == FIELDNAMES:
                for r in reader:
                    rows.append(r)
                    seen.add((r["symbol"], r["timeframe"], r["strategy_name"]))
    except FileNotFoundError:
        pass
    return rows, seen


def append_rows(rows: list[dict], include_header: bool) -> None:
    if not rows:
        return
    with open(OUT_CSV, "a", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDNAMES)
        if include_header:
            writer.writeheader()
        writer.writerows(rows)


def register_portfolio(symbol: str, timeframe: str, strat: str, params: dict) -> dict:
    payload = {
        "name": f"AUTO_{strat}_{symbol}_{timeframe}_{params_to_str(params)}",
        "base_strategy_name": strat,
        "symbol": symbol,
        "timeframe": timeframe,
        "pattern_params": params,
        "exit_rules": EXIT_RULES,
        "risk_management": {"type": "percent_risk", "value": 2.0},
        "is_active": False,   # seguridad: nunca activar sin supervisión manual
    }
    return _post("/api/v1/portfolio/strategies", payload)


# ---------------------------------------------------------------------- main

def main() -> None:
    pairs = get_available_data()
    if not pairs:
        print("[A] No hay datos importados (freshness != missing). Saliendo.")
        sys.exit(1)

    # 1h primero (menos velas, más rápido); 15m después.
    pairs.sort(key=lambda p: p["timeframe"] != "1h")
    print(f"[A] Pares a barrer ({len(pairs)}): {pairs}")

    all_rows, seen_keys = load_existing_rows()
    print(f"[R] Resume: {len(seen_keys)} pares/estrategias ya escaneados "
          f"({len(all_rows)} filas existentes)")

    jobs = []
    for pair in pairs:
        for strat_cfg in STRATEGIES:
            jobs.append((pair, strat_cfg))
    total = len(jobs)
    print(f"[B] Jobs a ejecutar: {total}")

    new_file = not os.path.exists(OUT_CSV)
    done = 0

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        futures = {
            ex.submit(run_job, f"{i + 1}/{total}", pair, cfg, seen_keys): (pair, cfg)
            for i, (pair, cfg) in enumerate(jobs)
        }
        for fut in as_completed(futures):
            try:
                rows = fut.result()
            except Exception as exc:
                log(f"FAIL job: {type(exc).__name__}: {exc}")
                continue
            all_rows.extend(rows)
            done += 1
            with _progress_lock:
                append_rows(rows, include_header=new_file)
                new_file = False
            log(f"[progress] {done}/{total} jobs completados, {len(all_rows)} filas")

    # Resumen de ganadoras
    winners = [r for r in all_rows if r["verdict"] == "robust"
               and (r["confirm_net_profit"] is not None)
               and (float(r["confirm_net_profit"]) > WINNER_MIN_NET_PROFIT)
               and (r["confirm_profit_factor"] is not None)
               and (float(r["confirm_profit_factor"]) >= WINNER_MIN_OOS_PF)
               and (int(r["confirm_trades"]) >= WINNER_MIN_TRADES)]
    winners.sort(key=lambda r: float(r["confirm_profit_factor"]), reverse=True)
    print(f"\n[E] Barrido finalizado: {len(all_rows)} filas en {OUT_CSV} "
          f"({len(winners)} ganadoras)")

    if not winners:
        print("No hay ganadoras robustas esta pasada. Fin.")
        return

    print(f"[P] Registrando top {MAX_REGISTER} ganadoras en portfolio (is_active=false) ...")
    for row in winners[:MAX_REGISTER]:
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

    # Reescritura final: TODO el dataset conservado, con columna registered actualizada.
    all_rows.sort(key=lambda r: (r["symbol"], r["timeframe"], r["strategy_name"]))
    with open(OUT_CSV, "w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(all_rows)
    print(f"[DONE] {OUT_CSV} reescrito con {len(all_rows)} filas (dataset completo).")


if __name__ == "__main__":
    main()