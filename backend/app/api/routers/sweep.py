import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.config import VALID_TIMEFRAMES
from app.core.models import SweepRun
from app.infra.db import SessionLocal
from app.services import mass_sweep_engine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/sweep", tags=["sweep"])

DEFAULT_TIMEFRAMES = ["5m", "15m", "30m", "1h", "4h", "1d"]


class SweepRunRequest(BaseModel):
    reset: bool = False
    timeframes: list[str] = Field(default_factory=lambda: DEFAULT_TIMEFRAMES)
    symbols: list[str] = Field(default_factory=list)


class RegimeRequest(BaseModel):
    symbols: list[str] = Field(default_factory=list)
    timeframes: list[str] = Field(default_factory=lambda: DEFAULT_TIMEFRAMES)


def _validate_timeframes(timeframes: list[str]) -> None:
    for tf in timeframes:
        if tf not in VALID_TIMEFRAMES:
            raise HTTPException(status_code=422, detail=f"Timeframe inválido: {tf}")


def _resolve_symbols(requested: list[str]) -> list[str]:
    if requested:
        return [s.strip().upper() for s in requested if s.strip()]
    return list(mass_sweep_engine.TOP_SYMBOLS)


@router.post("/run", status_code=202)
def run_sweep(payload: SweepRunRequest):
    _validate_timeframes(payload.timeframes)
    symbols = _resolve_symbols(payload.symbols)
    if not symbols:
        raise HTTPException(status_code=422, detail="No hay símbolos para barrer")

    run_id = mass_sweep_engine.start_sweep(payload.reset, payload.timeframes, symbols)
    if run_id is None:
        raise HTTPException(status_code=409, detail="Ya hay un sweep en ejecución")
    return {"run_id": run_id, "status": "queued", "reset": payload.reset}


@router.get("/status")
def get_status():
    return mass_sweep_engine.get_status()


@router.get("/results")
def get_results():
    return mass_sweep_engine.get_results()


@router.post("/regime")
def run_regime(payload: RegimeRequest):
    _validate_timeframes(payload.timeframes)
    symbols = _resolve_symbols(payload.symbols)
    regimes = mass_sweep_engine.run_market_regime_analysis(symbols, payload.timeframes)
    return {"count": len(regimes), "regimes": regimes}


@router.get("/regimes")
def get_regimes():
    return mass_sweep_engine.get_regimes()


@router.get("/history")
def list_sweep_history(limit: int = 20, offset: int = 0) -> list[dict]:
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    db = SessionLocal()
    try:
        runs = (
            db.execute(
                select(SweepRun)
                .order_by(SweepRun.created_at.desc())
                .offset(offset)
                .limit(limit)
            )
            .scalars()
            .all()
        )
    finally:
        db.close()

    return [
        {
            "id": str(run.id),
            "run_id": run.run_id,
            "status": run.status,
            "reset": run.reset,
            "timeframes": run.timeframes,
            "symbols_count": len(run.symbols),
            "results_count": len(run.results or []),
            "summary_count": len(run.summary or []),
            "output_dir": run.output_dir,
            "error": run.error,
            "created_at": run.created_at,
            "completed_at": run.completed_at,
        }
        for run in runs
    ]