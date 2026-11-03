from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.datasets import router as dataset_router
from app.api.routes.config import router as config_router
from app.api.routes.auth import router as auth_router
from app.api.routes.health import router as health_router
from app.api.routes.models import router as model_router
from app.api.routes.predictions import router as prediction_router
from app.api.routes.reports import router as report_router
from app.core.config import settings
from app.core.middleware import UploadRequestLimitMiddleware
from app.db.database import engine, init_db

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    try:
        yield
    finally:
        engine.dispose()


app = FastAPI(
    title="Parcel-AI API",
    summary="Shipment delay prediction and operational analytics backend",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

origins = [origin.strip() for origin in settings.allowed_origins.split(",") if origin.strip()]
app.add_middleware(UploadRequestLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-CSRF-Token", "X-Organization-ID"],
)

app.include_router(health_router)
app.include_router(auth_router, prefix=settings.api_prefix)
app.include_router(config_router, prefix=settings.api_prefix)
app.include_router(dataset_router, prefix=settings.api_prefix)
app.include_router(model_router, prefix=settings.api_prefix)
app.include_router(prediction_router, prefix=settings.api_prefix)
app.include_router(report_router, prefix=settings.api_prefix)


@app.exception_handler(Exception)
async def internal_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        "unhandled_api_error",
        extra={"http_method": request.method, "http_path": request.url.path},
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
