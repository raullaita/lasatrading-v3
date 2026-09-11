import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.models import SystemLog
from app.infra.db import get_db
from app.infra.telegram_client import send_telegram_message
from app.services import config_service
from app.services.health_service import check_system_health

router = APIRouter(prefix="/api/v1/system", tags=["system"])

TELEGRAM_TEST_MESSAGE = "✅ LasaTrading v3.0: Conexión correcta"


class ConfigUpdate(BaseModel):
    updates: dict[str, str | int | float | bool] = Field(...)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _write_log(
    db: Session,
    level: str,
    module: str,
    message: str,
    details: dict | None = None,
) -> None:
    db.add(
        SystemLog(
            level=level,
            module=module,
            message=message,
            details=details,
            timestamp=_utcnow(),
        )
    )
    db.commit()


def _log_to_dict(item: SystemLog) -> dict:
    return {
        "id": str(item.id),
        "timestamp": item.timestamp,
        "level": item.level,
        "module": item.module,
        "message": item.message,
        "details": item.details,
    }


@router.get("/config")
def read_config(db: Session = Depends(get_db)) -> dict:
    return config_service.get_all_config(db)


@router.put("/config")
def update_config(payload: ConfigUpdate, db: Session = Depends(get_db)) -> dict:
    updates = {
        str(key): value for key, value in payload.updates.items() if value is not None
    }
    config_service.set_configs(db, updates)
    _write_log(
        db,
        "INFO",
        "system",
        f"Configuración actualizada: {', '.join(sorted(updates))}",
    )
    return config_service.get_all_config(db)


@router.post("/config/test-telegram")
def test_telegram(db: Session = Depends(get_db)) -> dict:
    token = config_service.get_config(db, "notifications.telegram_token") or os.getenv(
        "TELEGRAM_BOT_TOKEN", ""
    )
    chat_id = config_service.get_config(
        db, "notifications.telegram_chat_id"
    ) or os.getenv("TELEGRAM_CHAT_ID", "")

    if not token or not chat_id:
        _write_log(db, "WARNING", "telegram", "Test de Telegram fallido: no configurado")
        return {"sent": False, "message": "Telegram no configurado"}

    sent = send_telegram_message(
        TELEGRAM_TEST_MESSAGE, bot_token=token, chat_id=chat_id
    )
    if sent:
        _write_log(db, "INFO", "telegram", "Mensaje de prueba de Telegram enviado")
        return {"sent": True, "message": "Mensaje de prueba enviado correctamente"}
    _write_log(
        db, "ERROR", "telegram", "Test de Telegram fallido: error al enviar el mensaje"
    )
    return {"sent": False, "message": "Error al enviar el mensaje de prueba"}


@router.get("/health")
def health() -> dict:
    return check_system_health()


@router.get("/logs")
def list_logs(
    level: str | None = None,
    module: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
) -> list[dict]:
    limit = max(1, min(limit, 200))
    stmt = select(SystemLog)
    if level:
        stmt = stmt.where(SystemLog.level == level.upper())
    if module:
        stmt = stmt.where(SystemLog.module == module.strip().lower())
    stmt = stmt.order_by(SystemLog.timestamp.desc()).limit(limit)
    items = db.execute(stmt).scalars().all()
    return [_log_to_dict(item) for item in items]