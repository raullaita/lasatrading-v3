import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.models import MonitorJob, PriceAlert, SignalLog, UserStrategy
from app.infra.db import get_db
from app.infra.telegram_client import send_telegram_message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/monitor", tags=["monitor"])


class PriceAlertCreate(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=20)
    condition: str
    target_price: float = Field(..., gt=0)


def _job_to_dict(item: MonitorJob) -> dict:
    return {
        "id": str(item.id),
        "user_strategy_id": str(item.user_strategy_id),
        "status": item.status,
        "last_run_at": item.last_run_at,
        "last_signal_at": item.last_signal_at,
        "error_count": item.error_count,
        "created_at": item.created_at,
    }


def _signal_to_dict(item: SignalLog) -> dict:
    return {
        "id": str(item.id),
        "job_id": str(item.job_id),
        "symbol": item.symbol,
        "timeframe": item.timeframe,
        "strategy_name": item.strategy_name,
        "signal_type": item.signal_type,
        "price": item.price,
        "timestamp": item.timestamp,
        "telegram_sent": item.telegram_sent,
    }


def _alert_to_dict(item: PriceAlert) -> dict:
    return {
        "id": str(item.id),
        "symbol": item.symbol,
        "condition": item.condition,
        "target_price": item.target_price,
        "is_active": item.is_active,
        "last_triggered_at": item.last_triggered_at,
        "created_at": item.created_at,
    }


def _get_job_or_404(db: Session, job_id: str) -> MonitorJob:
    try:
        parsed = uuid.UUID(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Job no encontrado") from exc
    item = db.get(MonitorJob, parsed)
    if item is None:
        raise HTTPException(status_code=404, detail="Job no encontrado")
    return item


def _get_alert_or_404(db: Session, alert_id: str) -> PriceAlert:
    try:
        parsed = uuid.UUID(alert_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Alerta no encontrada") from exc
    item = db.get(PriceAlert, parsed)
    if item is None:
        raise HTTPException(status_code=404, detail="Alerta no encontrada")
    return item


@router.get("/jobs")
def list_jobs(db: Session = Depends(get_db)) -> list[dict]:
    items = db.execute(select(MonitorJob).order_by(MonitorJob.created_at)).scalars().all()
    return [_job_to_dict(item) for item in items]


@router.post("/jobs", status_code=201)
def create_job(payload: dict, db: Session = Depends(get_db)):
    strategy_id = payload.get("user_strategy_id")
    if not strategy_id:
        raise HTTPException(status_code=422, detail="user_strategy_id es obligatorio")
    try:
        parsed = uuid.UUID(strategy_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="user_strategy_id inválido") from exc
    strategy = db.get(UserStrategy, parsed)
    if strategy is None:
        raise HTTPException(status_code=404, detail="Estrategia no encontrada")

    existing = (
        db.execute(
            select(MonitorJob).where(MonitorJob.user_strategy_id == parsed)
        )
        .scalars()
        .first()
    )
    if existing is not None:
        existing.status = "running"
        existing.error_count = 0
        db.commit()
        db.refresh(existing)
        return _job_to_dict(existing)

    job = MonitorJob(
        user_strategy_id=parsed,
        status="running",
        error_count=0,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    logger.info(
        "Job de monitor creado para estrategia %s (%s)",
        strategy.name,
        strategy_id,
    )
    return _job_to_dict(job)


@router.get("/signals")
def list_signals(limit: int = 50, db: Session = Depends(get_db)) -> list[dict]:
    limit = max(1, min(limit, 200))
    items = (
        db.execute(
            select(SignalLog)
            .order_by(SignalLog.timestamp.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    return [_signal_to_dict(item) for item in items]


@router.get("/price-alerts")
def list_price_alerts(db: Session = Depends(get_db)) -> list[dict]:
    items = (
        db.execute(select(PriceAlert).order_by(PriceAlert.created_at.desc()))
        .scalars()
        .all()
    )
    return [_alert_to_dict(item) for item in items]


@router.post("/price-alerts", status_code=201)
def create_price_alert(payload: PriceAlertCreate, db: Session = Depends(get_db)):
    if payload.condition not in (">", "<"):
        raise HTTPException(status_code=422, detail="Condición inválida: usa '>' o '<'")
    alert = PriceAlert(
        symbol=payload.symbol.strip().upper(),
        condition=payload.condition,
        target_price=payload.target_price,
        is_active=True,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    logger.info(
        "Alerta de precio creada: %s %s %s",
        alert.symbol,
        alert.condition,
        alert.target_price,
    )
    return _alert_to_dict(alert)


@router.delete("/price-alerts/{alert_id}")
def delete_price_alert(alert_id: str, db: Session = Depends(get_db)) -> dict:
    logger.info("Eliminando alerta de precio ID: %s", alert_id)
    item = _get_alert_or_404(db, alert_id)
    db.delete(item)
    db.commit()
    logger.info(
        "Alerta de precio eliminada: %s %s %s",
        item.symbol,
        item.condition,
        item.target_price,
    )
    return {"status": "deleted", "id": alert_id}


@router.post("/test-telegram")
def test_telegram() -> dict:
    sent = send_telegram_message("\U0001f4e1 LasaTrading v3.0: Conexión de Telegram correcta ✅")
    return {"sent": sent, "message": "Mensaje enviado" if sent else "Telegram no configurado"}