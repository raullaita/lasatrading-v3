import logging
import os
import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field
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
            "Backtest completado: %s %s (estrategia %s, %d trades)",
            payload.symbol,
            payload.timeframe,
            payload.strategy_name,
            len(result["trades"]),
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