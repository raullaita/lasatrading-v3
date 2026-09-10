import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.models import Watchlist
from app.infra.db import get_db

router = APIRouter(prefix="/api/v1/watchlist", tags=["watchlist"])

VALID_SYMBOL_RE = re.compile(r"^[A-Z0-9-]+$")


class WatchlistCreate(BaseModel):
    symbol: str
    notes: str | None = None


def _to_dict(item: Watchlist) -> dict:
    return {
        "symbol": item.symbol,
        "is_favorite": item.is_favorite,
        "notes": item.notes,
        "added_at": item.added_at,
    }


@router.get("")
def list_watchlist(db: Session = Depends(get_db)):
    items = db.execute(select(Watchlist).order_by(Watchlist.added_at)).scalars().all()
    return [_to_dict(item) for item in items]


@router.post("", status_code=201)
def add_watchlist(payload: WatchlistCreate, db: Session = Depends(get_db)):
    symbol = payload.symbol.strip().upper()
    if not VALID_SYMBOL_RE.match(symbol):
        raise HTTPException(status_code=422, detail=f"Símbolo inválido: {payload.symbol}")

    if db.get(Watchlist, symbol):
        raise HTTPException(status_code=409, detail="El símbolo ya está en la watchlist")

    item = Watchlist(symbol=symbol, notes=payload.notes)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _to_dict(item)