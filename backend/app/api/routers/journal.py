import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.models import Trade
from app.infra.db import get_db

router = APIRouter(prefix="/api/v1/journal", tags=["journal"])

VALID_TRADE_TYPES = {"backtest", "paper", "real"}
VALID_STATUSES = {"open", "closed", "cancelled"}


class TradeCreate(BaseModel):
    trade_type: str
    strategy_id: str | None = None
    signal_id: str | None = None
    symbol: str = Field(..., min_length=1, max_length=20)
    direction: str
    entry_price_expected: float | None = None
    entry_price_actual: float | None = None
    entry_timestamp: datetime | None = None
    exit_price_expected: float | None = None
    exit_price_actual: float | None = None
    exit_timestamp: datetime | None = None
    quantity: float | None = None
    commission: float = Field(default=0.0, ge=0.0)
    pnl_net: float | None = None
    status: str = "open"
    notes: str | None = None


class TradeUpdate(BaseModel):
    trade_type: str | None = None
    strategy_id: str | None = None
    signal_id: str | None = None
    symbol: str | None = Field(default=None, min_length=1, max_length=20)
    direction: str | None = None
    entry_price_expected: float | None = None
    entry_price_actual: float | None = None
    entry_timestamp: datetime | None = None
    exit_price_expected: float | None = None
    exit_price_actual: float | None = None
    exit_timestamp: datetime | None = None
    quantity: float | None = None
    commission: float | None = Field(default=None, ge=0.0)
    pnl_net: float | None = None
    status: str | None = None
    notes: str | None = None


class ExecutionAnalysisRequest(BaseModel):
    signal_timestamp: datetime
    execution_timestamp: datetime
    expected_price: float = Field(..., gt=0)
    actual_price: float = Field(..., gt=0)
    direction: str


def _to_dict(item: Trade) -> dict:
    return {
        "id": str(item.id),
        "trade_type": item.trade_type,
        "strategy_id": str(item.strategy_id) if item.strategy_id else None,
        "signal_id": str(item.signal_id) if item.signal_id else None,
        "symbol": item.symbol,
        "direction": item.direction,
        "entry_price_expected": item.entry_price_expected,
        "entry_price_actual": item.entry_price_actual,
        "entry_timestamp": item.entry_timestamp,
        "exit_price_expected": item.exit_price_expected,
        "exit_price_actual": item.exit_price_actual,
        "exit_timestamp": item.exit_timestamp,
        "quantity": item.quantity,
        "commission": item.commission,
        "pnl_net": item.pnl_net,
        "status": item.status,
        "notes": item.notes,
        "created_at": item.created_at,
    }


def _validate_enums(payload: TradeCreate | TradeUpdate) -> None:
    if payload.trade_type is not None and payload.trade_type not in VALID_TRADE_TYPES:
        raise HTTPException(status_code=422, detail="trade_type inválido")
    if payload.direction is not None and payload.direction not in {"long", "short"}:
        raise HTTPException(status_code=422, detail="direction inválido")
    if payload.status is not None and payload.status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail="status inválido")


def _compute_pnl(trade: Trade) -> float | None:
    entry = trade.entry_price_actual or trade.entry_price_expected
    exit_price = trade.exit_price_actual or trade.exit_price_expected
    if entry is None or exit_price is None or trade.quantity is None:
        return None
    if trade.direction == "short":
        return (entry - exit_price) * trade.quantity - trade.commission
    return (exit_price - entry) * trade.quantity - trade.commission


def _get_trade_or_404(db: Session, trade_id: str) -> Trade:
    try:
        parsed = uuid.UUID(trade_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Operación no encontrada") from exc
    item = db.get(Trade, parsed)
    if item is None:
        raise HTTPException(status_code=404, detail="Operación no encontrada")
    return item


@router.get("/trades")
def list_trades(
    trade_type: str | None = None,
    status: str | None = None,
    direction: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
) -> list[dict]:
    limit = max(1, min(limit, 500))
    query = select(Trade).order_by(Trade.created_at.desc()).limit(limit)
    if trade_type is not None:
        if trade_type not in VALID_TRADE_TYPES:
            raise HTTPException(status_code=422, detail="trade_type inválido")
        query = query.where(Trade.trade_type == trade_type)
    if status is not None:
        if status not in VALID_STATUSES:
            raise HTTPException(status_code=422, detail="status inválido")
        query = query.where(Trade.status == status)
    if direction is not None:
        if direction not in {"long", "short"}:
            raise HTTPException(status_code=422, detail="direction inválido")
        query = query.where(Trade.direction == direction)
    items = db.execute(query).scalars().all()
    return [_to_dict(item) for item in items]


@router.post("/trades", status_code=201)
def create_trade(payload: TradeCreate, db: Session = Depends(get_db)) -> dict:
    _validate_enums(payload)
    item = Trade(
        trade_type=payload.trade_type,
        strategy_id=uuid.UUID(payload.strategy_id) if payload.strategy_id else None,
        signal_id=uuid.UUID(payload.signal_id) if payload.signal_id else None,
        symbol=payload.symbol.strip().upper(),
        direction=payload.direction,
        entry_price_expected=payload.entry_price_expected,
        entry_price_actual=payload.entry_price_actual,
        entry_timestamp=payload.entry_timestamp,
        exit_price_expected=payload.exit_price_expected,
        exit_price_actual=payload.exit_price_actual,
        exit_timestamp=payload.exit_timestamp,
        quantity=payload.quantity,
        commission=payload.commission,
        pnl_net=payload.pnl_net,
        status=payload.status,
        notes=payload.notes,
    )
    if item.status == "closed":
        computed = _compute_pnl(item)
        if computed is not None:
            item.pnl_net = computed
    db.add(item)
    db.commit()
    db.refresh(item)
    return _to_dict(item)


@router.put("/trades/{trade_id}")
def update_trade(
    trade_id: str, payload: TradeUpdate, db: Session = Depends(get_db)
) -> dict:
    item = _get_trade_or_404(db, trade_id)
    _validate_enums(payload)

    if payload.trade_type is not None:
        item.trade_type = payload.trade_type
    if payload.strategy_id is not None:
        item.strategy_id = uuid.UUID(payload.strategy_id)
    if payload.signal_id is not None:
        item.signal_id = uuid.UUID(payload.signal_id)
    if payload.symbol is not None:
        item.symbol = payload.symbol.strip().upper()
    if payload.direction is not None:
        item.direction = payload.direction
    if payload.entry_price_expected is not None:
        item.entry_price_expected = payload.entry_price_expected
    if payload.entry_price_actual is not None:
        item.entry_price_actual = payload.entry_price_actual
    if payload.entry_timestamp is not None:
        item.entry_timestamp = payload.entry_timestamp
    if payload.exit_price_expected is not None:
        item.exit_price_expected = payload.exit_price_expected
    if payload.exit_price_actual is not None:
        item.exit_price_actual = payload.exit_price_actual
    if payload.exit_timestamp is not None:
        item.exit_timestamp = payload.exit_timestamp
    if payload.quantity is not None:
        item.quantity = payload.quantity
    if payload.commission is not None:
        item.commission = payload.commission
    if payload.pnl_net is not None:
        item.pnl_net = payload.pnl_net
    if payload.status is not None:
        item.status = payload.status
    if payload.notes is not None:
        item.notes = payload.notes

    if item.status == "closed":
        computed = _compute_pnl(item)
        if payload.pnl_net is None and computed is not None:
            item.pnl_net = computed
    db.commit()
    db.refresh(item)
    return _to_dict(item)


@router.delete("/trades/{trade_id}")
def delete_trade(trade_id: str, db: Session = Depends(get_db)) -> dict:
    item = _get_trade_or_404(db, trade_id)
    db.delete(item)
    db.commit()
    return {"status": "deleted", "id": trade_id}


@router.post("/analyze-execution")
def analyze_execution(payload: ExecutionAnalysisRequest) -> dict:
    if payload.direction not in {"long", "short"}:
        raise HTTPException(status_code=422, detail="direction inválido")

    raw_slippage = (
        (payload.actual_price - payload.expected_price) / payload.expected_price
    ) * 100
    slippage_pct = raw_slippage if payload.direction == "long" else -raw_slippage

    latency_seconds = (
        payload.execution_timestamp - payload.signal_timestamp
    ).total_seconds()

    impact_pnl = -slippage_pct / 100 * payload.expected_price

    return {
        "slippage_pct": round(slippage_pct, 4),
        "latency_seconds": round(latency_seconds, 2),
        "impact_pnl": round(impact_pnl, 4),
    }