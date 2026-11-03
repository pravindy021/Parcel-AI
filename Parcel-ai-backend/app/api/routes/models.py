from __future__ import annotations

import logging
import json
import uuid
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from openpyxl.utils.exceptions import InvalidFileException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.api.dependencies import current_tenant
from app.db.database import get_db
from app.db.models import ModelVersion, UploadedDataset
from app.schemas.model import TrainModelRequest
from app.services.data_validation import DatasetValidationService
from app.services.auth import TenantContext, require_permission
from app.services.column_mapping import apply_column_mapping
from app.services.file_storage import stored_upload_path
from app.services.model_service import ModelTrainingService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/models")


@router.post("/train")
async def train_model(
    payload: TrainModelRequest,
    context: TenantContext = Depends(current_tenant),
    db: Session = Depends(get_db),
):
    require_permission(context, "write")
    if payload.synthetic:
        if settings.environment.lower() == "production":
            raise HTTPException(status_code=403, detail="Synthetic training data is disabled in production")
        df = ModelTrainingService.generate_synthetic_dataset()
        training_data_source = "synthetic_demo"
    elif payload.dataset_id:
        dataset = db.query(UploadedDataset).filter(
            UploadedDataset.id == payload.dataset_id,
            UploadedDataset.organization_id == context.organization_id,
        ).first()
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")
        try:
            file_path = stored_upload_path(dataset.stored_name)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail="Stored file is missing") from exc
        if not file_path.is_file():
            raise HTTPException(status_code=404, detail="Stored file is missing")
        try:
            df = await run_in_threadpool(
                DatasetValidationService._coerce_dataframe,
                str(file_path),
                dataset.file_type,
            )
            mapping = json.loads(dataset.metadata_json or "{}").get("column_mapping", {})
            df = apply_column_mapping(df, mapping)
        except (UnicodeDecodeError, pd.errors.ParserError, pd.errors.EmptyDataError, InvalidFileException, OSError, ValueError) as exc:
            raise HTTPException(status_code=422, detail="Dataset content is invalid or unreadable") from exc
        training_data_source = "uploaded_dataset"
    elif payload.records:
        df = pd.DataFrame(payload.records)
        training_data_source = "provided_records"
    else:
        raise HTTPException(status_code=400, detail="Provide a dataset_id, synthetic flag, or records array to train a model.")

    try:
        result = await run_in_threadpool(ModelTrainingService.train, df, payload.model_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result["metrics"]["training_data_source"] = training_data_source

    model = ModelVersion(
        id=result["model_id"],
        organization_id=context.organization_id,
        name=result["name"],
        model_type=result["model_type"],
        version=result["version"],
        metrics_json=result["metrics"],
        feature_columns=result["feature_columns"],
        artifact_path=result["artifact_path"],
    )
    db.add(model)
    try:
        db.commit()
        db.refresh(model)
    except SQLAlchemyError as exc:
        db.rollback()
        Path(result["artifact_path"]).unlink(missing_ok=True)
        logger.exception("Could not save trained model metadata")
        raise HTTPException(status_code=503, detail="Trained model could not be saved") from exc
    return {
        "id": model.id,
        "name": model.name,
        "model_type": model.model_type,
        "version": model.version,
        "metrics": model.metrics_json,
        "feature_columns": model.feature_columns,
        "created_at": model.created_at.isoformat() if model.created_at else None,
    }


@router.get("")
async def list_models(
    context: TenantContext = Depends(current_tenant),
    db: Session = Depends(get_db),
):
    require_permission(context, "read")
    models = db.query(ModelVersion).filter(
        ModelVersion.organization_id == context.organization_id
    ).order_by(ModelVersion.created_at.desc()).all()
    return {"items": [{
        "id": model.id,
        "name": model.name,
        "model_type": model.model_type,
        "version": model.version,
        "metrics": model.metrics_json,
        "feature_columns": model.feature_columns,
        "created_at": model.created_at.isoformat(),
    } for model in models], "count": len(models)}


@router.get("/{model_id}")
async def get_model(
    model_id: str,
    context: TenantContext = Depends(current_tenant),
    db: Session = Depends(get_db),
):
    require_permission(context, "read")
    model = db.query(ModelVersion).filter(
        ModelVersion.id == model_id,
        ModelVersion.organization_id == context.organization_id,
    ).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    return {
        "id": model.id,
        "name": model.name,
        "model_type": model.model_type,
        "version": model.version,
        "metrics": model.metrics_json,
        "feature_columns": model.feature_columns,
        "created_at": model.created_at.isoformat(),
    }
