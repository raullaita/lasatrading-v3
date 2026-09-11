from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.models import Trade
from app.infra.db import get_db
from app.services.performance_service import (
    compute_by_strategy,
    compute_equity_curve,
    compute_summary,
)

router = APIRouter(prefix="/api/v1/performance", tags=["performance"])

VALID_TRADE_TYPES = {"backtest", "paper", "real"}


def _load_closed_trades(
    db: Session,
    trade_type: str | None,
    start_date: datetime | None,
    end_date: datetime | None,
) -> list[Trade]:
    query = select(Trade).where(Trade.status == "closed")
    if trade_type is not None and trade_type not in ("all", ""):
        if trade_type not in VALID_TRADE_TYPES:
            raise HTTPException(status_code=422, detail="trade_type inválido")
        query = query.where(Trade.trade_type == trade_type)
    if start_date is not None:
        query = query.where(Trade.exit_timestamp >= start_date)
    if end_date is not None:
        query = query.where(Trade.exit_timestamp <= end_date)
    return db.execute(query).scalars().all()


@router.get("/summary")
def performance_summary(
    trade_type: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    db: Session = Depends(get_db),
) -> dict:
    trades = _load_closed_trades(db, trade_type, start_date, end_date)
    return compute_summary(trades)


@router.get("/equity-curve")
def equity_curve(
    trade_type: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    db: Session = Depends(get_db),
) -> list[dict]:
    trades = _load_closed_trades(db, trade_type, start_date, end_date)
    return compute_equity_curve(trades)


@router.get("/by-strategy")
def performance_by_strategy(
    trade_type: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    db: Session = Depends(get_db),
) -> list[dict]:
    trades = _load_closed_trades(db, trade_type, start_date, end_date)
    return compute_by_strategy(db, trades)