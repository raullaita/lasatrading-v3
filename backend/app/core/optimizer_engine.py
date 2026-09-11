import itertools
import logging
from typing import Callable

import pandas as pd

from app.core.backtest_engine import run_backtest
from app.core.strategies.base import BaseStrategy

logger = logging.getLogger(__name__)

MIN_TRADES_DEFAULT = 10
MIN_PF_DEFAULT = 1.2
OOS_MIN_PF_DEFAULT = 1.3
OOS_MAX_DEGRADATION_DEFAULT = 0.3


def _generate_combinations(param_ranges: dict) -> list[dict]:
    keys = list(param_ranges.keys())
    value_lists = [param_ranges[k] for k in keys]
    return [dict(zip(keys, combo)) for combo in itertools.product(*value_lists)]


def _compute_degradation(pf_is: float | None, pf_oos: float | None) -> float:
    if pf_is is None and pf_oos is None:
        return 0.0
    if pf_is is None:
        return 1.0
    if pf_is <= 0:
        return 1.0
    if pf_oos is None:
        return 0.0
    return (pf_is - pf_oos) / pf_is


def _classify_candidate(
    pf_is: float | None,
    pf_oos: float | None,
    oos_min_pf: float,
    oos_max_degradation: float,
) -> str:
    if pf_oos is not None and pf_oos < 1.0:
        return "failed"
    if pf_is == 0:
        return "failed"
    degradation = _compute_degradation(pf_is, pf_oos)
    pf_oos_equiv = float("inf") if pf_oos is None else pf_oos
    if pf_oos_equiv >= oos_min_pf and degradation < oos_max_degradation:
        return "robust"
    return "overfit"


def run_optimization(
    df: pd.DataFrame,
    strategy: BaseStrategy,
    param_ranges: dict,
    exit_rules: dict,
    oos_config: dict,
    initial_capital: float,
    commission_pct: float,
    slippage_pct: float,
    progress_callback: Callable[[int, int, list[dict]], None] | None = None,
    check_cancelled: Callable[[], bool] | None = None,
) -> dict:
    combinations = _generate_combinations(param_ranges)
    total = len(combinations)

    oos_enabled = oos_config.get("enabled", False)
    split_ratio = oos_config.get("split_ratio", 0.7)
    oos_min_pf = oos_config.get("min_pf", OOS_MIN_PF_DEFAULT)
    oos_max_degradation = oos_config.get("max_degradation", OOS_MAX_DEGRADATION_DEFAULT)
    min_trades = oos_config.get("min_trades", MIN_TRADES_DEFAULT)
    min_pf = oos_config.get("min_pf", MIN_PF_DEFAULT)

    if oos_enabled and len(df) > 0:
        split_idx = int(len(df) * split_ratio)
        df_is = df.iloc[:split_idx].reset_index(drop=True)
        df_oos = df.iloc[split_idx:].reset_index(drop=True)
    else:
        df_is = df
        df_oos = None

    candidates: list[dict] = []
    completed = 0

    for i, params in enumerate(combinations):
        if check_cancelled and check_cancelled():
            break

        completed = i + 1

        try:
            result_is = run_backtest(
                df_is, strategy, params, exit_rules,
                initial_capital, commission_pct, slippage_pct,
            )
        except Exception as exc:
            logger.warning("IS backtest falló para %s: %s", params, exc)
            if progress_callback:
                progress_callback(i + 1, total, candidates)
            continue

        metrics_is = result_is["metrics"]
        pf_is = metrics_is.get("profit_factor")

        if metrics_is["total_trades"] < min_trades:
            if progress_callback:
                progress_callback(i + 1, total, candidates)
            continue
        if pf_is is not None and (not isinstance(pf_is, (int, float)) or pf_is < min_pf):
            if progress_callback:
                progress_callback(i + 1, total, candidates)
            continue

        metrics_oos: dict = {"win_rate": 0, "profit_factor": 0, "max_drawdown": 0, "total_trades": 0}
        degradation = 0.0

        if oos_enabled and df_oos is not None and len(df_oos) > 0:
            try:
                result_oos = run_backtest(
                    df_oos, strategy, params, exit_rules,
                    initial_capital, commission_pct, slippage_pct,
                )
                metrics_oos = result_oos["metrics"]
                pf_oos = metrics_oos.get("profit_factor")
                degradation = _compute_degradation(pf_is, pf_oos)
            except Exception as exc:
                logger.warning("OOS backtest falló para %s: %s", params, exc)
                metrics_oos = {"win_rate": 0, "profit_factor": 0, "max_drawdown": 0, "total_trades": 0}
                degradation = 1.0
        else:
            metrics_oos = metrics_is.copy()
            degradation = 0.0

        pf_oos_val = metrics_oos.get("profit_factor")
        verdict = _classify_candidate(pf_is, pf_oos_val, oos_min_pf, oos_max_degradation)

        candidate = {
            "params": params,
            "is_metrics": {
                "win_rate": metrics_is.get("win_rate", 0),
                "profit_factor": metrics_is.get("profit_factor"),
                "max_drawdown": metrics_is.get("max_drawdown", 0),
                "total_trades": metrics_is.get("total_trades", 0),
            },
            "oos_metrics": {
                "win_rate": metrics_oos.get("win_rate", 0),
                "profit_factor": metrics_oos.get("profit_factor"),
                "max_drawdown": metrics_oos.get("max_drawdown", 0),
                "total_trades": metrics_oos.get("total_trades", 0),
            },
            "degradation": round(degradation * 100, 2),
            "verdict": verdict,
        }
        candidates.append(candidate)

        if progress_callback:
            progress_callback(i + 1, total, candidates)

    candidates.sort(key=lambda c: c.get("oos_metrics", {}).get("profit_factor") or 0, reverse=True)
    for rank, c in enumerate(candidates, 1):
        c["rank"] = rank

    return {
        "candidates": candidates,
        "total_combinations": total,
        "completed": completed,
    }
