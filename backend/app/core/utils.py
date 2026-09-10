from datetime import datetime, timedelta, timezone

_TIME_UNITS = {
    "m": 60,
    "h": 60 * 60,
    "d": 24 * 60 * 60,
    "w": 7 * 24 * 60 * 60,
}


def timeframe_to_seconds(timeframe: str) -> int | None:
    timeframe = (timeframe or "").strip().lower()
    if not timeframe:
        return None
    unit = timeframe[-1]
    if unit not in _TIME_UNITS:
        return None
    try:
        value = int(timeframe[:-1])
    except ValueError as exc:
        return None
    if unit == "m" and value not in (1, 3, 5, 15, 30):
        return None
    if unit == "h" and value not in (1, 2, 4, 6, 8, 12):
        return None
    if unit == "d" and value not in (1, 3):
        return None
    return value * _TIME_UNITS[unit]


def refresh_interval_seconds(timeframe: str) -> int:
    if (timeframe or "").strip().lower() in ("1m", "3m"):
        return 60
    return 300


def is_stale(timeframe: str, last_candle_at: datetime | None, now: datetime | None = None) -> bool:
    if last_candle_at is None:
        return True
    seconds = timeframe_to_seconds(timeframe)
    if seconds is None:
        return False
    now = now or datetime.now(timezone.utc)
    if last_candle_at.tzinfo is None:
        last_candle_at = last_candle_at.replace(tzinfo=timezone.utc)
    return (now - last_candle_at) > timedelta(seconds=seconds)


def needs_refresh(refresh_seconds: int, last_candle_at: datetime | None, now: datetime | None = None) -> bool:
    if last_candle_at is None:
        return True
    now = now or datetime.now(timezone.utc)
    if last_candle_at.tzinfo is None:
        last_candle_at = last_candle_at.replace(tzinfo=timezone.utc)
    return (now - last_candle_at) > timedelta(seconds=refresh_seconds)