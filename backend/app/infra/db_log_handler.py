import logging
import sys

from app.core.models import SystemLog
from app.infra.db import SessionLocal


class DatabaseLogHandler(logging.Handler):
    """Persiste cada registro de log en la tabla ``system_logs``.

    Cualquier error al escribir en la base de datos se captura y se
    envía a stderr para no romper la aplicación en ejecución.
    """

    def __init__(self) -> None:
        super().__init__()

    def emit(self, record: logging.LogRecord) -> None:
        try:
            db = SessionLocal()
            try:
                details = None
                if record.exc_info:
                    details = {"stack_trace": self.format(record)}
                db.add(
                    SystemLog(
                        level=record.levelname[:10],
                        module=(record.name or "root")[:50],
                        message=record.getMessage(),
                        details=details,
                    )
                )
                db.commit()
            finally:
                db.close()
        except Exception:
            try:
                sys.stderr.write(
                    f"[db_log_handler] error persisting log record: {record.getMessage()}\n"
                )
            except Exception:
                pass