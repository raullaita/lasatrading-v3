import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.models import MarketDataFile
from app.core.utils import refresh_interval_seconds
from app.infra.binance_client import fetch_klines
from app.infra.parquet_utils import append_candles, get_parquet_metadata

logger = logging.getLogger(__name__)


def _update_file_from_parquet(db: Session, file: MarketDataFile) -> None:
    metadata = get_parquet_metadata(file.file_path)
    if metadata is None:
        logger.error("Parquet no encontrado para %s %s", file.symbol, file.timeframe)
        return
    file.row_count = metadata["row_count"]
    file.first_candle_at = metadata["first_candle_at"]
    file.last_candle_at = metadata["last_candle_at"]
    file.file_size_mb = metadata["file_size_mb"]
    file.updated_at = datetime.now(timezone.utc)
    db.add(file)


def refresh_file(db: Session, file: MarketDataFile) -> bool:
    candles = fetch_klines(file.symbol, file.timeframe, limit=10)
    appended = append_candles(file.file_path, candles)
    if appended > 0:
        _update_file_from_parquet(db, file)
        db.commit()
        logger.info(
            "Data Updater: %d velas añadidas a %s %s",
            appended,
            file.symbol,
            file.timeframe,
        )
        return True
    return False


async def run_data_updater(db: Session) -> int:
    files = db.execute(select(MarketDataFile)).scalars().all()
    now = datetime.now(timezone.utc)
    updated = 0

    for file in files:
        refresh_seconds = refresh_interval_seconds(file.timeframe)
        if file.last_candle_at is None or file.updated_at is None:
            continue
        if (now - file.updated_at) <= timedelta(seconds=refresh_seconds):
            continue
        try:
            ok = await asyncio.to_thread(refresh_file, db, file)
            if ok:
                updated += 1
        except Exception as exc:
            logger.error("Data Updater: fallo en %s %s: %s", file.symbol, file.timeframe, exc)

    db.commit()
    return updated