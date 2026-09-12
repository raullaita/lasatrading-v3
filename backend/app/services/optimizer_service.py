import logging
import threading
import uuid
from typing import Any

import pandas as pd

from app.core.models import OptimizationRun
from app.core.optimizer_engine import run_optimization
from app.core.strategies.base import BaseStrategy
from app.infra.db import SessionLocal

logger = logging.getLogger(__name__)

_OPTIMIZATION_TASKS: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()


def _generate_param_ranges(param_ranges_raw: dict) -> dict:
    result: dict = {}
    for key, spec in param_ranges_raw.items():
        min_val = spec.get("min", 0)
        max_val = spec.get("max", 100)
        step = spec.get("step", 1)
        values = []
        current = min_val
        while current <= max_val + 0.0001:
            if spec.get("type") == "float":
                values.append(round(current, 4))
            else:
                values.append(int(current))
            current += step
        result[key] = values
    return result


def start_optimization_task(
    df: pd.DataFrame,
    strategy: BaseStrategy,
    param_ranges_raw: dict,
    exit_rules: dict,
    oos_config: dict,
    initial_capital: float,
    commission_pct: float,
    slippage_pct: float,
    symbol: str | None = None,
    timeframe: str | None = None,
    strategy_name: str | None = None,
) -> str:
    task_id = str(uuid.uuid4())

    param_ranges = _generate_param_ranges(param_ranges_raw)
    total_combinations = 1
    for values in param_ranges.values():
        total_combinations *= len(values)

    with _lock:
        _OPTIMIZATION_TASKS[task_id] = {
            "status": "running",
            "progress_pct": 0.0,
            "completed_combinations": 0,
            "total_combinations": total_combinations,
            "top_candidates_partial": [],
            "result": None,
            "cancelled": False,
            "error": None,
        }

    def _run() -> None:
        task = _OPTIMIZATION_TASKS[task_id]

        def _progress(completed: int, total: int, candidates: list) -> None:
            task["completed_combinations"] = completed
            task["progress_pct"] = round(completed / total * 100, 1) if total > 0 else 0.0
            sorted_cands = sorted(candidates, key=lambda c: c.get("oos_metrics", {}).get("profit_factor") or 0, reverse=True)
            task["top_candidates_partial"] = sorted_cands[:3]

        def _check_cancelled() -> bool:
            return task.get("cancelled", False)

        try:
            result = run_optimization(
                df, strategy, param_ranges, exit_rules, oos_config,
                initial_capital, commission_pct, slippage_pct,
                progress_callback=_progress,
                check_cancelled=_check_cancelled,
            )
            if task.get("cancelled"):
                task["status"] = "cancelled"
            else:
                task["status"] = "completed"
                task["result"] = result
                task["completed_combinations"] = result["completed"]
                task["progress_pct"] = 100.0
                logger.info(
                    "Optimización completada: %s candidatos en %d combinaciones",
                    len(result.get("candidates", [])),
                    result.get("total_combinations", 0),
                )
                if result["candidates"]:
                    sorted_cands = sorted(result["candidates"], key=lambda c: c.get("oos_metrics", {}).get("profit_factor") or 0, reverse=True)
                    task["top_candidates_partial"] = sorted_cands[:3]
                _persist_optimization_run(
                    task_id,
                    result,
                    symbol=symbol,
                    timeframe=timeframe,
                    strategy_name=strategy_name,
                    param_ranges_raw=param_ranges_raw,
                    oos_config=oos_config,
                )
        except Exception as exc:
            task["status"] = "failed"
            task["error"] = str(exc)
            logger.error("Optimization task %s failed: %s", task_id, exc)

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    return task_id


def _persist_optimization_run(
    task_id: str,
    result: dict,
    symbol: str | None,
    timeframe: str | None,
    strategy_name: str | None,
    param_ranges_raw: dict,
    oos_config: dict,
) -> None:
    try:
        db = SessionLocal()
        try:
            existing = db.get(OptimizationRun, uuid.UUID(task_id))
            run = existing or OptimizationRun(id=uuid.UUID(task_id))
            run.symbol = symbol or ""
            run.timeframe = timeframe or ""
            run.strategy_name = strategy_name or ""
            run.param_ranges = param_ranges_raw
            run.oos_config = oos_config
            run.candidates = result.get("candidates", [])
            run.total_combinations = result.get("total_combinations", 0)
            run.completed_combinations = result.get("completed", 0)
            db.add(run)
            db.commit()
        finally:
            db.close()
    except Exception as exc:
        logger.error("No se pudo persistir la optimización %s: %s", task_id, exc)


def get_persisted_result(task_id: str) -> dict | None:
    try:
        db = SessionLocal()
        try:
            run = db.get(OptimizationRun, uuid.UUID(task_id))
        finally:
            db.close()
    except Exception as exc:
        logger.error("No se pudo leer la optimización %s de BD: %s", task_id, exc)
        return None

    if run is None:
        return None
    return {
        "candidates": run.candidates,
        "total_combinations": run.total_combinations,
        "completed_combinations": run.completed_combinations,
    }


def get_task_status(task_id: str) -> dict | None:
    with _lock:
        task = _OPTIMIZATION_TASKS.get(task_id)
        if task is None:
            return None
        return {
            "status": task["status"],
            "progress_pct": task["progress_pct"],
            "completed_combinations": task["completed_combinations"],
            "total_combinations": task["total_combinations"],
            "top_candidates_partial": task["top_candidates_partial"],
            "error": task.get("error"),
        }


def cancel_task(task_id: str) -> bool:
    with _lock:
        task = _OPTIMIZATION_TASKS.get(task_id)
        if task is None:
            return False
        if task["status"] != "running":
            return False
        task["cancelled"] = True
        return True


def get_task_results(task_id: str) -> dict | None:
    with _lock:
        task = _OPTIMIZATION_TASKS.get(task_id)
        if task is None:
            return None
        if task["status"] != "completed":
            return None
        return task["result"]
