import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import DATA_STORAGE_DIR, VALID_TIMEFRAMES
from app.core.models import MarketDataFile
from app.core.utils import is_stale
from app.infra.binance_client import fetch_klines
from app.infra.db import SessionLocal, get_db
from app.infra.parquet_utils import append_candles, get_parquet_metadata

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/data", tags=["data"])

_TASKS: dict[str, dict] = {}

VALID_SYMBOL_RE = re.compile(r"^[A-Z0-9-]+$")


class ImportRequest(BaseModel):
    symbols: list[str]
    timeframes: list[str]
    start_date: str | None = None
    source: str = "binance"


def _parse_start_date(value: str | None) -> datetime:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"start_date inválido: {value}") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _upsert_market_data_file(
    db: Session, symbol: str, timeframe: str, file_path: str, metadata: dict
) -> None:
    file = db.execute(
        select(MarketDataFile).where(
            MarketDataFile.symbol == symbol, MarketDataFile.timeframe == timeframe
        )
    ).scalar_one_or_none()

    if file is None:
        file = MarketDataFile(
            id=uuid.uuid4(), symbol=symbol, timeframe=timeframe, file_path=file_path
        )
        db.add(file)

    file.row_count = metadata["row_count"]
    file.first_candle_at = metadata["first_candle_at"]
    file.last_candle_at = metadata["last_candle_at"]
    file.file_size_mb = metadata["file_size_mb"]
    file.updated_at = datetime.now(timezone.utc)
    db.commit()


def _download_symbol_timeframe(
    db: Session, symbol: str, timeframe: str, start_date: str | None
) -> None:
    file_path = os.path.join(DATA_STORAGE_DIR, f"{symbol}_{timeframe}.parquet")
    metadata = get_parquet_metadata(file_path)

    if metadata and metadata["last_candle_at"]:
        start_dt = metadata["last_candle_at"]
    else:
        start_dt = _parse_start_date(start_date) or (
            datetime.now(timezone.utc) - timedelta(days=365)
        )

    while True:
        candles = fetch_klines(
            symbol, timeframe, start_time=int(start_dt.timestamp() * 1000), limit=1000
        )
        if not candles:
            break
        append_candles(file_path, candles)
        if len(candles) < 1000:
            break
        start_dt = candles[-1]["timestamp"] + timedelta(milliseconds=1)

    metadata = get_parquet_metadata(file_path)
    if metadata is None:
        raise RuntimeError(f"No se generó el archivo Parquet para {symbol} {timeframe}")
    _upsert_market_data_file(db, symbol, timeframe, file_path, metadata)
    logger.info(
        "Import completado: %s %s (%d velas, %s)",
        symbol,
        timeframe,
        metadata["row_count"],
        file_path,
    )


def _run_historical_import(
    task_id: str, symbols: list[str], timeframes: list[str], start_date: str | None
) -> None:
    task = _TASKS[task_id]
    task["status"] = "running"
    total = len(symbols) * len(timeframes)
    done = 0

    db = SessionLocal()
    try:
        for symbol in symbols:
            for timeframe in timeframes:
                try:
                    _download_symbol_timeframe(db, symbol, timeframe, start_date)
                except Exception as exc:
                    task["errors"].append(f"{symbol} {timeframe}: {exc}")
                    logger.error("Import fallido para %s %s: %s", symbol, timeframe, exc)
                done += 1
                task["progress"] = round(done / total * 100)
        task["status"] = "done"
    finally:
        db.close()


@router.get("/status")
def data_status(db: Session = Depends(get_db)):
    files = db.execute(
        select(MarketDataFile).order_by(MarketDataFile.symbol, MarketDataFile.timeframe)
    ).scalars().all()
    now = datetime.now(timezone.utc)
    result = []
    for file in files:
        if not os.path.exists(file.file_path):
            freshness = "missing"
        elif is_stale(file.timeframe, file.last_candle_at, now):
            freshness = "stale"
        else:
            freshness = "fresh"

        result.append(
            {
                "id": str(file.id),
                "symbol": file.symbol,
                "timeframe": file.timeframe,
                "file_path": file.file_path,
                "row_count": file.row_count,
                "first_candle_at": file.first_candle_at,
                "last_candle_at": file.last_candle_at,
                "file_size_mb": file.file_size_mb,
                "updated_at": file.updated_at,
                "freshness_status": freshness,
            }
        )
    return result


@router.post("/import", status_code=202)
def import_data(payload: ImportRequest, background_tasks: BackgroundTasks):
    for timeframe in payload.timeframes:
        if timeframe not in VALID_TIMEFRAMES:
            raise HTTPException(status_code=422, detail=f"Timeframe inválido: {timeframe}")
    for symbol in payload.symbols:
        if not VALID_SYMBOL_RE.match(symbol):
            raise HTTPException(status_code=422, detail=f"Símbolo inválido: {symbol}")

    _parse_start_date(payload.start_date)

    task_id = str(uuid.uuid4())
    _TASKS[task_id] = {"status": "queued", "progress": 0, "errors": []}
    background_tasks.add_task(
        _run_historical_import, task_id, payload.symbols, payload.timeframes, payload.start_date
    )
    return {"task_id": task_id, "status": "queued"}