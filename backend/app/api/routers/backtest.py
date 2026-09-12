import logging
import os
import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.backtest_engine import run_backtest
from app.core.config import DATA_STORAGE_DIR, VALID_TIMEFRAMES
from app.core.models import BacktestRun
from app.core.strategies.registry import registry
from app.infra.db import SessionLocal
from app.infra.parquet_utils import load_parquet

router = APIRouter(prefix="/api/v1/backtest", tags=["backtest"])

logger = logging.getLogger(__name__)

_BACKTEST_RESULTS: dict[str, dict] = {}


class ExitRules(BaseModel):
    stop_loss_type: str = "atr_multiplier"
    stop_loss_value: float = 1.5
    take_profit_type: str = "risk_reward_ratio"
    take_profit_value: float = 2.0


class BacktestRequest(BaseModel):
    symbol: str
    timeframe: str
    strategy_name: str
    strategy_params: dict = Field(default_factory=dict)
    exit_rules: ExitRules = Field(default_factory=ExitRules)
    initial_capital: float = 10000.0
    commission_pct: float = 0.001
    slippage_pct: float = 0.1


def _execute_backtest(task_id: str, payload: BacktestRequest) -> None:
    try:
        df_path = os.path.join(
            DATA_STORAGE_DIR, f"{payload.symbol}_{payload.timeframe}.parquet"
        )
        df = load_parquet(df_path)
        strategy = registry.get_by_name(payload.strategy_name)
        if strategy is None:
            raise ValueError(f"Estrategia no encontrada: {payload.strategy_name}")
        result = run_backtest(
            df,
            strategy,
            payload.strategy_params,
            payload.exit_rules.model_dump(),
            payload.initial_capital,
            payload.commission_pct,
            payload.slippage_pct,
        )
        _BACKTEST_RESULTS[task_id] = {"status": "completed", **result}
        logger.info(
            "Backtest completado: %s trades, PF: %s",
            result["metrics"]["total_trades"],
            result["metrics"]["profit_factor"],
        )

        db: Session = SessionLocal()
        try:
            existing = db.get(BacktestRun, uuid.UUID(task_id))
            run = existing or BacktestRun(id=uuid.UUID(task_id))
            run.symbol = payload.symbol
            run.timeframe = payload.timeframe
            run.strategy_name = payload.strategy_name
            run.params = payload.strategy_params
            run.exit_rules = payload.exit_rules.model_dump()
            run.metrics = result["metrics"]
            run.equity_curve = result["equity_curve"]
            run.trades = result["trades"]
            db.add(run)
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.error("No se pudo persistir el backtest %s: %s", task_id, exc)
        finally:
            db.close()
    except Exception as exc:
        _BACKTEST_RESULTS[task_id] = {"status": "error", "detail": str(exc)}


@router.post("/run", status_code=202)
def run_backtest_endpoint(payload: BacktestRequest, background_tasks: BackgroundTasks):
    logger.info(
        "Iniciando backtest: %s %s con %s",
        payload.symbol,
        payload.timeframe,
        payload.strategy_name,
    )
    if payload.timeframe not in VALID_TIMEFRAMES:
        raise HTTPException(status_code=422, detail=f"Timeframe inválido: {payload.timeframe}")
    if registry.get_by_name(payload.strategy_name) is None:
        raise HTTPException(status_code=404, detail="Estrategia no encontrada")

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

    task_id = str(uuid.uuid4())
    _BACKTEST_RESULTS[task_id] = {"status": "running"}
    background_tasks.add_task(_execute_backtest, task_id, payload)
    return {"task_id": task_id, "status": "queued"}


def _run_to_summary(run: BacktestRun) -> dict:
    return {
        "id": str(run.id),
        "symbol": run.symbol,
        "timeframe": run.timeframe,
        "strategy_name": run.strategy_name,
        "metrics": run.metrics,
        "created_at": run.created_at,
    }


@router.get("/history")
def list_backtests(
    strategy_name: str | None = None,
    symbol: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    stmt = select(BacktestRun)
    if strategy_name:
        stmt = stmt.where(BacktestRun.strategy_name == strategy_name)
    if symbol:
        stmt = stmt.where(BacktestRun.symbol == symbol)
    stmt = stmt.order_by(BacktestRun.created_at.desc()).offset(offset).limit(limit)

    db: Session = SessionLocal()
    try:
        runs = db.execute(stmt).scalars().all()
    finally:
        db.close()
    return [_run_to_summary(run) for run in runs]


@router.get("/{backtest_id}")
def get_backtest_detail(backtest_id: str) -> dict:
    try:
        run_uuid = uuid.UUID(backtest_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Backtest no encontrado") from exc

    db: Session = SessionLocal()
    try:
        run = db.get(BacktestRun, run_uuid)
    finally:
        db.close()

    if run is None:
        raise HTTPException(status_code=404, detail="Backtest no encontrado")
    return {
        **_run_to_summary(run),
        "params": run.params,
        "exit_rules": run.exit_rules,
        "equity_curve": run.equity_curve,
        "trades": run.trades,
    }


@router.delete("/{backtest_id}")
def delete_backtest(backtest_id: str) -> dict:
    logger.info("Eliminando backtest ID: %s", backtest_id)
    try:
        run_uuid = uuid.UUID(backtest_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Backtest no encontrado") from exc

    db: Session = SessionLocal()
    try:
        run = db.get(BacktestRun, run_uuid)
        if run is None:
            raise HTTPException(status_code=404, detail="Backtest no encontrado")
        db.delete(run)
        db.commit()
    finally:
        db.close()

    _BACKTEST_RESULTS.pop(backtest_id, None)
    logger.info("Backtest eliminado correctamente: %s", backtest_id)
    return {"status": "deleted", "id": backtest_id}


@router.get("/results/{task_id}")
def get_backtest_results(task_id: str):
    result = _BACKTEST_RESULTS.get(task_id)
    if result is not None:
        return result

    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Backtest no encontrado") from exc

    db: Session = SessionLocal()
    try:
        run = db.get(BacktestRun, task_uuid)
    finally:
        db.close()

    if run is None:
        raise HTTPException(status_code=404, detail="Backtest no encontrado")
    return {
        "status": "completed",
        "metrics": run.metrics,
        "equity_curve": run.equity_curve,
        "trades": run.trades,
    }