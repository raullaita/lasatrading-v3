import os
import shutil
import time
from datetime import datetime, timezone

import httpx
import redis
from sqlalchemy import text

from app.infra.db import engine

GIB = 1024**3
DISK_WARNING_THRESHOLD_PCT = 90


def _check_database() -> dict:
    start = time.monotonic()
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        latency_ms = round((time.monotonic() - start) * 1000, 1)
        return {"status": "ok", "latency_ms": latency_ms}
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "error": str(exc)}


def _check_redis() -> dict:
    try:
        client = redis.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", "6379")),
            db=0,
            socket_timeout=3,
        )
        client.ping()
        client.close()
        return {"status": "ok"}
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "error": str(exc)}


def _check_disk_space() -> dict:
    usage = shutil.disk_usage("/")
    free_gb = round(usage.free / GIB, 2)
    percent_used = round(usage.used / usage.total * 100, 1)
    total_gb = round(usage.total / GIB, 2)
    status = "ok" if percent_used <= DISK_WARNING_THRESHOLD_PCT else "warning"
    return {
        "status": status,
        "free_gb": free_gb,
        "total_gb": total_gb,
        "percent_used": percent_used,
    }


def _check_binance_api() -> dict:
    try:
        resp = httpx.get("https://api.binance.com/api/v3/ping", timeout=5)
        resp.raise_for_status()
        return {"status": "ok"}
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "error": str(exc)}


def _check_telegram() -> dict:
    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")
    if token and chat_id:
        return {"status": "ok", "is_configured": True}
    return {
        "status": "error",
        "is_configured": False,
        "error": "Env vars TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID no configuradas",
    }


def check_system_health() -> dict:
    return {
        "database": _check_database(),
        "redis": _check_redis(),
        "disk_space": _check_disk_space(),
        "binance_api": _check_binance_api(),
        "telegram": _check_telegram(),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }