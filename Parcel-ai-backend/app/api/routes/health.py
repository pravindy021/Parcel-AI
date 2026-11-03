import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.db.database import engine

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/")
def read_root() -> dict:
    return {"app": "Parcel-AI", "status": "ready"}


@router.get("/health")
def health_check() -> dict:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        logger.exception("Database health check failed")
        return JSONResponse(
            status_code=503,
            content={
                "status": "degraded",
                "service": "parcel-ai-backend",
                "database": "unavailable",
            },
        )
    return {
        "status": "healthy",
        "service": "parcel-ai-backend",
        "database": "available",
    }
