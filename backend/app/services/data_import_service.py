import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import DATA_STORAGE_DIR
from app.core.models import MarketDataFile
from app.infra.binance_client import fetch_klines
from app.infra.db import SessionLocal
from app.infra.parquet_utils import append_candles, get_parquet_metadata

logger = logging.getLogger(__name__)


def parse_start_date(value: str | None) -> datetime | None:
    """Convierte una fecha ISO-8601 a datetime con zona horaria UTC."""
    if not value:
        return None
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def upsert_market_data_file(
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


def download_symbol_timeframe(
    db: Session, symbol: str, timeframe: str, start_date: str | None
) -> int:
    """Descarga datos históricos de Binance para un símbolo/timeframe y los
    persiste en Parquet + BD. Devuelve el número de velas añadidas."""
    file_path = os.path.join(DATA_STORAGE_DIR, f"{symbol}_{timeframe}.parquet")
    metadata = get_parquet_metadata(file_path)

    if metadata and metadata["last_candle_at"]:
        start_dt = metadata["last_candle_at"]
    else:
        start_dt = parse_start_date(start_date) or (
            datetime.now(timezone.utc) - timedelta(days=365)
        )

    total_appended = 0
    page = 0
    while True:
        candles = fetch_klines(
            symbol, timeframe, start_time=int(start_dt.timestamp() * 1000), limit=1000
        )
        if not candles:
            break
        page += 1
        total_appended += append_candles(file_path, candles)
        logger.info(
            "Importación %s %s: página %d descargada (%d velas, total %d)",
            symbol,
            timeframe,
            page,
            len(candles),
            total_appended,
        )
        if len(candles) < 1000:
            break
        start_dt = candles[-1]["timestamp"] + timedelta(milliseconds=1)

    metadata = get_parquet_metadata(file_path)
    if metadata is None:
        raise RuntimeError(f"No se generó el archivo Parquet para {symbol} {timeframe}")
    upsert_market_data_file(db, symbol, timeframe, file_path, metadata)
    logger.info(
        "Import completado: %s %s (%d velas, archivo %s)",
        symbol,
        timeframe,
        metadata["row_count"],
        file_path,
    )
    return total_appended


def ensure_symbol_timeframe_imported(
    symbol: str, timeframe: str, start_date: str | None = None
) -> int:
    """Importa (o actualiza) datos para un símbolo/timeframe en su propia sesión.

    Pensado para ejecutarse en segundo plano (BackgroundTasks) al crear o
    activar una estrategia. Los errores se registran con detalle y se
    re-lanzan para que no queden silenciados.
    """
    symbol = symbol.strip().upper()
    logger.info("Importación automática: inicio para %s %s", symbol, timeframe)

    db = SessionLocal()
    try:
        total = download_symbol_timeframe(db, symbol, timeframe, start_date)
        logger.info(
            "Importación automática: %s %s completada (%d velas añadidas)",
            symbol,
            timeframe,
            total,
        )
        return total
    except Exception as exc:
        logger.exception(
            "Importación automática: error en %s %s: %s", symbol, timeframe, exc
        )
        raise
    finally:
        db.close()