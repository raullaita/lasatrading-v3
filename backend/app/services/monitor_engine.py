import logging
from datetime import datetime, timezone

import pandas as pd
from sqlalchemy.orm import Session

from app.core.models import MonitorJob, SignalLog, UserStrategy
from app.core.strategies.registry import registry
from app.infra.binance_client import fetch_klines
from app.infra.telegram_client import send_telegram_message

logger = logging.getLogger(__name__)


def _is_candle_closed(candle: dict, now: datetime) -> bool:
    candle_ts = candle["timestamp"]
    if candle_ts.tzinfo is None:
        candle_ts = candle_ts.replace(tzinfo=timezone.utc)
    elapsed = (now - candle_ts).total_seconds()
    return elapsed > 60


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def evaluate_job(job: MonitorJob, strategy: UserStrategy, db: Session) -> None:
    """Evalúa un job contra la última vela cerrada de Binance.

    Usa la sesión ``db`` del llamador para persistir cambios en el job y
    el SignalLog, garantizando consistencia con el estado cargado.
    """
    now = datetime.now(timezone.utc)
    klines = fetch_klines(strategy.symbol, strategy.timeframe, limit=2)

    if len(klines) < 2:
        return

    last_closed = klines[-2]

    if not _is_candle_closed(last_closed, now):
        return

    candle_ts = _as_utc(last_closed["timestamp"])
    last_run = job.last_run_at
    if last_run is not None and candle_ts <= _as_utc(last_run):
        return

    strategy_cls = registry.get_by_name(strategy.base_strategy_name)
    if strategy_cls is None:
        logger.error("Estrategia base no encontrada: %s", strategy.base_strategy_name)
        return

    candles_for_calc = pd.DataFrame(klines)
    result = strategy_cls.calculate(candles_for_calc, strategy.pattern_params)

    closed_row = result.iloc[-2]
    signal_value = int(closed_row.get("signal", 0))

    if signal_value == 1:
        signal_type = "buy"
        emoji = "\U0001f6a8"

        logger.info(
            "Señal BUY detectada: %s %s (estrategia %s) precio=%.4f en vela %s",
            strategy.symbol,
            strategy.timeframe,
            strategy.name,
            last_closed["close"],
            candle_ts.isoformat(),
        )

        log_entry = SignalLog(
            job_id=job.id,
            symbol=strategy.symbol,
            timeframe=strategy.timeframe,
            strategy_name=strategy.name,
            signal_type=signal_type,
            price=last_closed["close"],
            timestamp=candle_ts,
        )
        db.add(log_entry)

        msg = (
            f"{emoji} <b>SEÑAL BUY</b>\n"
            f"Símbolo: {strategy.symbol}\n"
            f"Estrategia: {strategy.name}\n"
            f"Precio: {last_closed['close']:.4f}\n"
            f"TF: {strategy.timeframe}"
        )
        sent = send_telegram_message(msg)
        log_entry.telegram_sent = sent
        logger.info(
            "Notificación Telegram para %s: %s",
            strategy.symbol,
            "enviada" if sent else "fallida",
        )

        job.last_signal_at = now

    job.last_run_at = candle_ts
    job.error_count = 0
    db.commit()