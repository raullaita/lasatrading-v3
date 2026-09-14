import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import VALID_TIMEFRAMES
from app.core.models import MonitorJob, UserStrategy
from app.core.strategies.registry import registry
from app.infra.db import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/portfolio", tags=["portfolio"])


class ExitRulesPayload(BaseModel):
    stop_loss_type: str = "atr_multiplier"
    stop_loss_value: float = 1.5
    take_profit_type: str = "risk_reward_ratio"
    take_profit_value: float = 2.0


class RiskManagementPayload(BaseModel):
    type: str = "percent_risk"
    value: float = Field(default=2.0, ge=0.0)


class StrategyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    base_strategy_name: str
    symbol: str
    timeframe: str
    pattern_params: dict = Field(default_factory=dict)
    exit_rules: ExitRulesPayload = Field(default_factory=ExitRulesPayload)
    risk_management: RiskManagementPayload = Field(default_factory=RiskManagementPayload)


class StrategyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    is_active: bool | None = None
    base_strategy_name: str | None = None
    symbol: str | None = None
    timeframe: str | None = None
    pattern_params: dict | None = None
    exit_rules: ExitRulesPayload | None = None
    risk_management: RiskManagementPayload | None = None


def _to_dict(item: UserStrategy) -> dict:
    return {
        "id": str(item.id),
        "name": item.name,
        "is_active": item.is_active,
        "base_strategy_name": item.base_strategy_name,
        "symbol": item.symbol,
        "timeframe": item.timeframe,
        "pattern_params": item.pattern_params or {},
        "exit_rules": item.exit_rules or {},
        "risk_management": item.risk_management or {},
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def _get_strategy_or_404(db: Session, strategy_id: str) -> UserStrategy:
    try:
        parsed = uuid.UUID(strategy_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Estrategia no encontrada") from exc
    item = db.get(UserStrategy, parsed)
    if item is None:
        raise HTTPException(status_code=404, detail="Estrategia no encontrada")
    return item


@router.get("/strategies")
def list_strategies(
    active_only: bool = False, db: Session = Depends(get_db)
) -> list[dict]:
    query = select(UserStrategy).order_by(UserStrategy.created_at)
    if active_only:
        query = query.where(UserStrategy.is_active.is_(True))
    items = db.execute(query).scalars().all()
    return [_to_dict(item) for item in items]


@router.get("/strategies/{strategy_id}")
def get_strategy(strategy_id: str, db: Session = Depends(get_db)) -> dict:
    return _to_dict(_get_strategy_or_404(db, strategy_id))


@router.post("/strategies", status_code=201)
def create_strategy(payload: StrategyCreate, db: Session = Depends(get_db)):
    if registry.get_by_name(payload.base_strategy_name) is None:
        raise HTTPException(status_code=422, detail="Estrategia base no encontrada")
    if not payload.symbol.strip().upper():
        raise HTTPException(status_code=422, detail="Símbolo inválido")
    if payload.timeframe not in VALID_TIMEFRAMES:
        raise HTTPException(status_code=422, detail=f"Timeframe inválido: {payload.timeframe}")

    item = UserStrategy(
        name=payload.name.strip(),
        is_active=False,
        base_strategy_name=payload.base_strategy_name,
        symbol=payload.symbol.strip().upper(),
        timeframe=payload.timeframe,
        pattern_params=payload.pattern_params,
        exit_rules=payload.exit_rules.model_dump(),
        risk_management=payload.risk_management.model_dump(),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    logger.info(
        "Estrategia '%s' creada para %s %s",
        item.name,
        item.symbol,
        item.timeframe,
    )
    return _to_dict(item)


@router.put("/strategies/{strategy_id}")
def update_strategy(
    strategy_id: str, payload: StrategyUpdate, db: Session = Depends(get_db)
) -> dict:
    item = _get_strategy_or_404(db, strategy_id)

    if payload.name is not None:
        item.name = payload.name.strip()
    if payload.is_active is not None:
        item.is_active = payload.is_active
    if payload.base_strategy_name is not None:
        if registry.get_by_name(payload.base_strategy_name) is None:
            raise HTTPException(status_code=422, detail="Estrategia base no encontrada")
        item.base_strategy_name = payload.base_strategy_name
    if payload.symbol is not None:
        item.symbol = payload.symbol.strip().upper()
    if payload.timeframe is not None:
        if payload.timeframe not in VALID_TIMEFRAMES:
            raise HTTPException(status_code=422, detail=f"Timeframe inválido: {payload.timeframe}")
        item.timeframe = payload.timeframe
    if payload.pattern_params is not None:
        item.pattern_params = payload.pattern_params
    if payload.exit_rules is not None:
        item.exit_rules = payload.exit_rules.model_dump()
    if payload.risk_management is not None:
        item.risk_management = payload.risk_management.model_dump()

    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    logger.info("Estrategia %s actualizada (%s)", strategy_id, item.name)
    return _to_dict(item)


@router.delete("/strategies/{strategy_id}")
def delete_strategy(strategy_id: str, db: Session = Depends(get_db)) -> dict:
    item = _get_strategy_or_404(db, strategy_id)
    job = (
        db.execute(select(MonitorJob).where(MonitorJob.user_strategy_id == item.id))
        .scalars()
        .first()
    )
    if job is not None:
        db.delete(job)
    db.delete(item)
    db.commit()
    logger.info("Estrategia eliminada ID: %s (%s)", strategy_id, item.name)
    return {"status": "deleted", "id": strategy_id}


@router.patch("/strategies/{strategy_id}/toggle")
def toggle_strategy(strategy_id: str, db: Session = Depends(get_db)) -> dict:
    item = _get_strategy_or_404(db, strategy_id)
    item.is_active = not item.is_active
    item.updated_at = datetime.now(timezone.utc)

    logger.info("Estrategia ID %s %s", strategy_id, "activada" if item.is_active else "pausada")

    job = (
        db.execute(select(MonitorJob).where(MonitorJob.user_strategy_id == item.id))
        .scalars()
        .first()
    )
    if item.is_active:
        if job is None:
            job = MonitorJob(
                user_strategy_id=item.id,
                status="running",
                error_count=0,
            )
            db.add(job)
        else:
            job.status = "running"
            job.error_count = 0
    else:
        if job is not None:
            job.status = "paused"

    db.commit()
    db.refresh(item)
    return _to_dict(item)
