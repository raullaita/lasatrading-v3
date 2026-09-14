import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import VALID_TIMEFRAMES
from app.core.models import MarketDataFile
from app.core.utils import is_stale
from app.infra.binance_client import fetch_klines
from app.infra.db import SessionLocal, get_db
from app.infra.parquet_utils import append_candles, get_parquet_metadata
from app.services.data_import_service import (
    download_symbol_timeframe,
    parse_start_date,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/data", tags=["data"])

_TASKS: dict[str, dict] = {}

VALID_SYMBOL_RE = re.compile(r"^[A-Z0-9-]+$")

# Top 50 most liquid USDT pairs on Binance (hardcoded for reliability)
TOP_SYMBOLS: list[str] = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
    "ADAUSDT", "DOGEUSDT", "DOTUSDT", "MATICUSDT", "LTCUSDT",
    "AVAXUSDT", "LINKUSDT", "ATOMUSDT", "UNIUSDT", "APTUSDT",
    "NEARUSDT", "FILUSDT", "AAVEUSDT", "GRTUSDT", "SANDUSDT",
    "AXSUSDT", "FLOWUSDT", "XTZUSDT", "ALGOUSDT", "VETUSDT",
    "THETAUSDT", "EGLDUSDT", "ICPUSDT", "FTMUSDT", "HBARUSDT",
    "WIFUSDT", "BONKUSDT", "TIAUSDT", "JUPUSDT", "WLDUSDT",
    "RENDERUSDT", "ARUSDT", "SUIUSDT", "TAOUSDT", "SEIUSDT",
    "ONDOUSDT", "RAYUSDT", "JTOUSDT", "PEPEUSDT", "FLOKIUSDT",
    "SHIBUSDT", "LRCUSDT", "ENSUSDT", "MAGICUSDT", "SLPUSDT",
]


@router.get("/symbols")
def get_symbols():
    return TOP_SYMBOLS


class ImportRequest(BaseModel):
    symbols: list[str]
    timeframes: list[str]
    start_date: str | None = None
    source: str = "binance"


def _validate_start_date(value: str | None) -> None:
    try:
        parse_start_date(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"start_date inválido: {value}") from exc


def _run_historical_import(
    task_id: str, symbols: list[str], timeframes: list[str], start_date: str | None
) -> None:
    task = _TASKS[task_id]
    task["status"] = "running"
    total = len(symbols) * len(timeframes)
    done = 0

    db = SessionLocal()
    total_appended = 0
    try:
        for symbol in symbols:
            for timeframe in timeframes:
                try:
                    total_appended += download_symbol_timeframe(db, symbol, timeframe, start_date)
                except Exception as exc:
                    task["errors"].append(f"{symbol} {timeframe}: {exc}")
                    logger.error("Import fallido para %s %s: %s", symbol, timeframe, exc)
                done += 1
                task["progress"] = round(done / total * 100)
        task["status"] = "done"
        logger.info("Importación completada: %d velas añadidas", total_appended)
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


@router.delete("/{file_id}")
def delete_file(file_id: str, db: Session = Depends(get_db)):
    logger.info("Eliminando archivo de datos ID: %s", file_id)
    file_record = db.execute(
        select(MarketDataFile).where(MarketDataFile.id == file_id)
    ).scalar_one_or_none()

    if file_record is None:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")

    try:
        if file_record.file_path and os.path.exists(file_record.file_path):
            os.remove(file_record.file_path)
    except Exception as exc:
        logger.warning("No se pudo eliminar el archivo en disco: %s", exc)

    try:
        db.delete(file_record)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Error al eliminar archivo %s: %s", file_id, exc)
        raise HTTPException(status_code=500, detail="Error al eliminar el archivo") from exc

    logger.info(
        "Archivo eliminado correctamente: %s %s", file_record.symbol, file_record.timeframe
    )

    return {"message": "Archivo eliminado correctamente"}


@router.post("/{file_id}/refresh")
def refresh_file(file_id: str, db: Session = Depends(get_db)):
    logger.info("Actualizando archivo ID: %s", file_id)
    file_record = db.execute(
        select(MarketDataFile).where(MarketDataFile.id == file_id)
    ).scalar_one_or_none()

    if file_record is None:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")

    symbol = file_record.symbol
    timeframe = file_record.timeframe

    try:
        candles = fetch_klines(symbol, timeframe, limit=10)
    except RuntimeError as exc:
        logger.error("Refresh fallido para %s %s (red/Binance): %s", symbol, timeframe, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Refresh fallido para %s %s: %s", symbol, timeframe, exc)
        raise HTTPException(status_code=500, detail=f"Error al obtener datos de Binance: {exc}") from exc

    try:
        new_candles = append_candles(file_record.file_path, candles)
    except Exception as exc:
        logger.error("Refresh fallido al guardar %s %s: %s", symbol, timeframe, exc)
        raise HTTPException(status_code=500, detail=f"Error al guardar los datos: {exc}") from exc

    metadata = get_parquet_metadata(file_record.file_path)
    if metadata is None:
        raise HTTPException(
            status_code=500, detail=f"No se pudo leer el archivo Parquet para {symbol} {timeframe}"
        )

    file_record.row_count = metadata["row_count"]
    file_record.first_candle_at = metadata["first_candle_at"]
    file_record.last_candle_at = metadata["last_candle_at"]
    file_record.file_size_mb = metadata["file_size_mb"]
    file_record.updated_at = datetime.now(timezone.utc)
    db.commit()

    logger.info(
        "Archivo actualizado: %s %s (%d velas nuevas añadidas)",
        symbol,
        timeframe,
        new_candles,
    )

    return {"message": "Datos actualizados correctamente", "new_candles": new_candles}


@router.post("/import", status_code=202)
def import_data(payload: ImportRequest, background_tasks: BackgroundTasks):
    logger.info(
        "Iniciando importación: %s %s desde %s",
        payload.symbols,
        payload.timeframes,
        payload.start_date,
    )
    for timeframe in payload.timeframes:
        if timeframe not in VALID_TIMEFRAMES:
            raise HTTPException(status_code=422, detail=f"Timeframe inválido: {timeframe}")
    for symbol in payload.symbols:
        if not VALID_SYMBOL_RE.match(symbol):
            raise HTTPException(status_code=422, detail=f"Símbolo inválido: {symbol}")

    _validate_start_date(payload.start_date)

    task_id = str(uuid.uuid4())
    _TASKS[task_id] = {"status": "queued", "progress": 0, "errors": []}
    background_tasks.add_task(
        _run_historical_import, task_id, payload.symbols, payload.timeframes, payload.start_date
    )
    return {"task_id": task_id, "status": "queued"}