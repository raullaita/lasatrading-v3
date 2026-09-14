import logging
import os
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import DATA_STORAGE_DIR, VALID_TIMEFRAMES
from app.core.models import OptimizationRun
from app.core.strategies.registry import registry
from app.infra.db import SessionLocal
from app.infra.parquet_utils import load_parquet
from app.services import optimizer_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/optimizer", tags=["optimizer"])

MAX_COMBINATIONS = 10000


class ExitRules(BaseModel):
    stop_loss_type: str = "atr_multiplier"
    stop_loss_value: float = 1.5
    take_profit_type: str = "risk_reward_ratio"
    take_profit_value: float = 2.0


class ParamRange(BaseModel):
    type: str = "int"
    min: float = Field(default=0)
    max: float = Field(default=100)
    step: float = Field(default=1)


class OOSConfig(BaseModel):
    enabled: bool = True
    split_ratio: float = Field(default=0.7, ge=0.1, le=0.95)
    min_pf: float = Field(default=1.3, ge=0.0)
    max_degradation: float = Field(default=0.3, ge=0.0)
    min_trades: int = Field(default=10, ge=1)


class OptimizationRequest(BaseModel):
    symbol: str
    timeframe: str
    strategy_name: str
    param_ranges: dict[str, ParamRange] = Field(...)
    exit_rules: ExitRules = Field(default_factory=ExitRules)
    oos_config: OOSConfig = Field(default_factory=OOSConfig)
    initial_capital: float = Field(default=10000.0, gt=0)
    commission_pct: float = Field(default=0.001, ge=0.0)
    slippage_pct: float = Field(default=0.1, ge=0.0)


def _count_combinations(param_ranges: dict[str, ParamRange]) -> int:
    total = 1
    for spec in param_ranges.values():
        span = spec.max - spec.min
        n = int(span // spec.step) + 1 if spec.step > 0 else 1
        total *= max(n, 1)
    return total


@router.post("/run", status_code=202)
def run_optimization(payload: OptimizationRequest):
    logger.info(
        "Iniciando optimización: %s %s con %s",
        payload.symbol,
        payload.timeframe,
        payload.strategy_name,
    )
    if payload.timeframe not in VALID_TIMEFRAMES:
        raise HTTPException(status_code=422, detail=f"Timeframe inválido: {payload.timeframe}")
    if registry.get_by_name(payload.strategy_name) is None:
        raise HTTPException(status_code=404, detail="Estrategia no encontrada")

    for name, spec in payload.param_ranges.items():
        if spec.min > spec.max:
            raise HTTPException(status_code=422, detail=f"Rango inválido en {name}: min > max")
        if spec.step <= 0:
            raise HTTPException(status_code=422, detail=f"Step inválido en {name}: debe ser > 0")

    df_path = os.path.join(
        DATA_STORAGE_DIR, f"{payload.symbol}_{payload.timeframe}.parquet"
    )
    if not os.path.exists(df_path):
        raise HTTPException(
            status_code=404,
            detail=(
                f"No hay datos importados para {payload.symbol} {payload.timeframe}. "
                "Imprescindible importarlos primero en /data."
            ),
        )

    total_combinations = _count_combinations(payload.param_ranges)
    if total_combinations > MAX_COMBINATIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Demasiadas combinaciones ({total_combinations}). Máximo permitido: {MAX_COMBINATIONS}.",
        )

    df = load_parquet(df_path)
    strategy = registry.get_by_name(payload.strategy_name)

    task_id = optimizer_service.start_optimization_task(
        df,
        strategy,
        {k: v.model_dump() for k, v in payload.param_ranges.items()},
        payload.exit_rules.model_dump(),
        payload.oos_config.model_dump(),
        payload.initial_capital,
        payload.commission_pct,
        payload.slippage_pct,
        symbol=payload.symbol,
        timeframe=payload.timeframe,
        strategy_name=payload.strategy_name,
    )
    logger.info(
        "Optimización encolada: %s (%d combinaciones), task %s",
        payload.strategy_name,
        total_combinations,
        task_id,
    )
    return {"task_id": task_id, "status": "queued", "total_combinations": total_combinations}


@router.get("/status/{task_id}")
def get_task_status(task_id: str):
    status = optimizer_service.get_task_status(task_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Tarea de optimización no encontrada")
    return status


@router.post("/cancel/{task_id}")
def cancel_task(task_id: str):
    logger.info("Cancelando optimización task ID: %s", task_id)
    cancelled = optimizer_service.cancel_task(task_id)
    if not cancelled:
        raise HTTPException(status_code=404, detail="Tarea no encontrada o no en ejecución")
    return {"task_id": task_id, "status": "cancelled"}


@router.get("/results/{task_id}")
def get_task_results(task_id: str):
    status = optimizer_service.get_task_status(task_id)
    if status is not None:
        if status["status"] != "completed":
            raise HTTPException(status_code=404, detail=f"La optimización aún no está completada (status: {status['status']})")
        result = optimizer_service.get_task_results(task_id)
        if result is None:
            raise HTTPException(status_code=500, detail="Resultado no disponible")
        result["completed_combinations"] = result.get("completed", 0)
        return result

    persisted = optimizer_service.get_persisted_result(task_id)
    if persisted is None:
        raise HTTPException(status_code=404, detail="Tarea de optimización no encontrada")
    return {"status": "completed", **persisted}


def _robust_count(candidates: list) -> int:
    return sum(1 for c in candidates if c.get("verdict") == "robust")


def _best_pf_oos(candidates: list) -> float | None:
    values = [
        c.get("oos_metrics", {}).get("profit_factor")
        for c in candidates
        if c.get("oos_metrics", {}).get("profit_factor") is not None
    ]
    return max(values) if values else None


def _run_to_summary(run: OptimizationRun) -> dict:
    return {
        "id": str(run.id),
        "symbol": run.symbol,
        "timeframe": run.timeframe,
        "strategy_name": run.strategy_name,
        "total_combinations": run.total_combinations,
        "robust_count": _robust_count(run.candidates),
        "best_pf_oos": _best_pf_oos(run.candidates),
        "created_at": run.created_at,
    }


@router.get("/history")
def list_optimizations(
    strategy_name: str | None = None,
    symbol: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    stmt = select(OptimizationRun)
    if strategy_name:
        stmt = stmt.where(OptimizationRun.strategy_name == strategy_name)
    if symbol:
        stmt = stmt.where(OptimizationRun.symbol == symbol)
    stmt = stmt.order_by(OptimizationRun.created_at.desc()).offset(offset).limit(limit)

    db: Session = SessionLocal()
    try:
        runs = db.execute(stmt).scalars().all()
    finally:
        db.close()
    return [_run_to_summary(run) for run in runs]


@router.get("/{optimization_id}")
def get_optimization_detail(optimization_id: str) -> dict:
    try:
        run_uuid = uuid.UUID(optimization_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Optimización no encontrada") from exc

    db: Session = SessionLocal()
    try:
        run = db.get(OptimizationRun, run_uuid)
    finally:
        db.close()

    if run is None:
        raise HTTPException(status_code=404, detail="Optimización no encontrada")
    return {
        **_run_to_summary(run),
        "param_ranges": run.param_ranges,
        "oos_config": run.oos_config,
        "exit_rules": run.exit_rules,
        "initial_capital": run.initial_capital,
        "commission_pct": run.commission_pct,
        "slippage_pct": run.slippage_pct,
        "completed_combinations": run.completed_combinations,
        "candidates": run.candidates,
    }


@router.delete("/{optimization_id}")
def delete_optimization(optimization_id: str) -> dict:
    logger.info("Eliminando optimización ID: %s", optimization_id)
    try:
        run_uuid = uuid.UUID(optimization_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Optimización no encontrada") from exc

    db: Session = SessionLocal()
    try:
        run = db.get(OptimizationRun, run_uuid)
        if run is None:
            raise HTTPException(status_code=404, detail="Optimización no encontrada")
        db.delete(run)
        db.commit()
    finally:
        db.close()

    logger.info("Optimización eliminada correctamente: %s", optimization_id)
    return {"status": "deleted", "id": optimization_id}