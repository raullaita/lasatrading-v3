import os
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.models import SystemConfig

DEFAULT_CONFIG = {
    "trading.initial_capital": 10000,
    "trading.risk_percent": 1.0,
    "notifications.telegram_token": os.getenv("TELEGRAM_BOT_TOKEN", ""),
    "notifications.telegram_chat_id": os.getenv("TELEGRAM_CHAT_ID", ""),
}

_NUMERIC_KEYS = {"trading.initial_capital", "trading.risk_percent"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _coerce(key: str, value):
    if key in _NUMERIC_KEYS:
        try:
            return float(value)
        except (TypeError, ValueError):
            return value
    return value


def mask_token(token: str) -> str:
    if not token:
        return ""
    if len(token) <= 8:
        return "••••"
    return f"{token[:6]}…{token[-4:]}"


def get_config(db: Session, key: str) -> str | None:
    item = db.get(SystemConfig, key)
    if item is None:
        return None
    return item.value


def set_config(db: Session, key: str, value, category: str | None = None) -> None:
    if category is None:
        category = key.split(".", 1)[0]
    item = db.get(SystemConfig, key)
    now = _utcnow()
    if item is None:
        item = SystemConfig(
            key=key,
            value=str(value),
            category=category,
            updated_at=now,
        )
        db.add(item)
    else:
        item.value = str(value)
        item.category = category
        item.updated_at = now
    db.commit()


def set_configs(db: Session, updates: dict) -> int:
    for key, value in updates.items():
        set_config(db, key, value)
    return len(updates)


def get_all_config(db: Session) -> dict:
    rows = db.execute(select(SystemConfig)).scalars().all()
    stored = {row.key: row.value for row in rows}

    categories = {}
    for key, merged in DEFAULT_CONFIG.items():
        category, name = key.split(".", 1)
        value = _coerce(key, stored.get(key, merged))
        categories.setdefault(category, {})[name] = value

    notifications = categories.setdefault("notifications", {})
    token = str(notifications.get("telegram_token", "") or "")
    notifications["telegram_is_configured"] = bool(token)
    notifications["telegram_token"] = mask_token(token)
    return categories