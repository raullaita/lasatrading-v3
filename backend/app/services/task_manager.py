import logging
import threading
import time

from app.core.models import MonitorJob, UserStrategy
from app.infra.db import SessionLocal
from app.services.monitor_engine import evaluate_job

logger = logging.getLogger(__name__)

_stop_event = threading.Event()


def _run_loop() -> None:
    logger.info("Monitor task_manager iniciado")
    while not _stop_event.is_set():
        try:
            db = SessionLocal()
            try:
                jobs = (
                    db.query(MonitorJob)
                    .filter(MonitorJob.status == "running")
                    .all()
                )
                for job in jobs:
                    try:
                        strategy = db.get(UserStrategy, job.user_strategy_id)
                        if strategy is None or not strategy.is_active:
                            continue
                        evaluate_job(job, strategy, db)
                    except Exception:
                        logger.exception("Error evaluando job %s", job.id)
                        db.rollback()
                        job.error_count += 1
                        if job.error_count >= 3:
                            job.status = "stopped"
                        db.commit()
            finally:
                db.close()
        except Exception:
            logger.exception("Error en el loop del task_manager")

        _stop_event.wait(timeout=60)


_thread: threading.Thread | None = None


def start_task_manager() -> None:
    global _thread
    if _thread is not None and _thread.is_alive():
        return
    _stop_event.clear()
    _thread = threading.Thread(target=_run_loop, daemon=True, name="monitor-task-manager")
    _thread.start()
    logger.info("Monitor task_manager thread started")


def stop_task_manager() -> None:
    _stop_event.set()
    logger.info("Monitor task_manager stopping...")
