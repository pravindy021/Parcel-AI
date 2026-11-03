from __future__ import annotations

import logging
import json
import math
import uuid
from pathlib import Path
from typing import Any, Dict, List

import joblib
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from openpyxl.utils.exceptions import InvalidFileException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.api.dependencies import current_tenant
from app.db.database import get_db
from app.db.models import ModelVersion, PredictionRecord, UploadedDataset
from app.schemas.prediction import PredictionInput
from app.services.data_validation import DatasetValidationService
from app.services.auth import TenantContext, require_permission
from app.services.column_mapping import apply_column_mapping
from app.services.file_storage import stored_upload_path
from app.services.model_service import prepare_for_model_prediction

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/predictions")


def _risk_level(probability: float) -> str:
    if probability >= settings.risk_high_threshold:
        return "high"
    if probability >= settings.risk_medium_threshold:
        return "medium"
    return "low"


def _predict_from_rows(model: ModelVersion, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    model_dir = Path(settings.model_dir).resolve()
    artifact = Path(model.artifact_path).resolve()
    try:
        artifact.relative_to(model_dir)
    except ValueError as exc:
        logger.error("Model %s references an artifact outside the configured model directory", model.id)
        raise HTTPException(status_code=503, detail="Model artifact is unavailable") from exc
    if not artifact.is_file():
        raise HTTPException(status_code=404, detail="Model artifact not found")
    try:
        pipeline = joblib.load(artifact)
    except (OSError, EOFError, ValueError) as exc:
        logger.exception("Could not load model artifact %s", model.id)
        raise HTTPException(status_code=503, detail="Model artifact could not be loaded") from exc
    frame = pd.DataFrame(rows)
    if frame.empty:
        return []
    try:
        prepared = prepare_for_model_prediction(frame, model.feature_columns)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not hasattr(pipeline, "predict_proba"):
        raise HTTPException(status_code=503, detail="Model does not support probability predictions")
    probabilities = pipeline.predict_proba(prepared)
    class_labels = list(pipeline.classes_)
    positive_class = next((index for index, label in enumerate(class_labels) if bool(label)), None)
    if positive_class is None:
        raise HTTPException(status_code=503, detail="Model has no delayed-shipment class")
    preds = probabilities[:, positive_class]
    result = []
    for idx, prob in enumerate(preds):
        prob_value = float(prob)
        if not math.isfinite(prob_value) or not 0 <= prob_value <= 1:
            raise HTTPException(status_code=500, detail="Model returned an invalid prediction probability")
        risk = _risk_level(prob_value)
        result.append({
            "shipment_id": frame.iloc[idx].get("shipment_id", f"item-{idx}"),
            "probability": prob_value,
            "risk_level": risk,
            "prediction": {"delay_probability": prob_value, "risk_level": risk},
        })
    return result


@router.post("")
async def predict(
    payload: PredictionInput,
    context: TenantContext = Depends(current_tenant),
    db: Session = Depends(get_db),
):
    require_permission(context, "write")
    model = db.query(ModelVersion).filter(
        ModelVersion.id == payload.model_id,
        ModelVersion.organization_id == context.organization_id,
    ).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    rows = payload.records
    if payload.dataset_id:
        dataset = db.query(UploadedDataset).filter(
            UploadedDataset.id == payload.dataset_id,
            UploadedDataset.organization_id == context.organization_id,
        ).first()
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")
        try:
            file_path = stored_upload_path(dataset.stored_name)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail="Stored dataset file is missing") from exc
        if not file_path.is_file():
            raise HTTPException(status_code=404, detail="Stored dataset file is missing")
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
        rows = df.to_dict(orient="records")
    if not rows:
        raise HTTPException(status_code=400, detail="No prediction records were supplied")
    if len(rows) > 10_000:
        raise HTTPException(status_code=413, detail="Prediction requests are limited to 10,000 records")

    predictions = await run_in_threadpool(_predict_from_rows, model, rows)
    saved = []
    for item in predictions:
        record = PredictionRecord(
            id=str(uuid.uuid4()),
            organization_id=context.organization_id,
            model_id=model.id,
            dataset_id=payload.dataset_id,
            shipment_id=str(item["shipment_id"]),
            probability=str(item["probability"]),
            risk_level=item["risk_level"],
            prediction_json=item["prediction"],
        )
        db.add(record)
        saved.append({
            "id": record.id,
            "model_id": record.model_id,
            "dataset_id": record.dataset_id,
            "shipment_id": record.shipment_id,
            "probability": float(record.probability),
            "risk_level": record.risk_level,
            "prediction": record.prediction_json,
        })
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not save prediction results")
        raise HTTPException(status_code=503, detail="Prediction results could not be saved") from exc
    return {"items": saved, "count": len(saved)}


@router.post("/batch")
async def batch_predict(
    payload: list[PredictionInput],
    context: TenantContext = Depends(current_tenant),
    db: Session = Depends(get_db),
):
    require_permission(context, "write")
    if not payload or len(payload) > 100:
        raise HTTPException(status_code=400, detail="Batch requests must contain between 1 and 100 prediction jobs")
    if sum(len(item.records) for item in payload) > 10_000:
        raise HTTPException(status_code=413, detail="Batch prediction requests are limited to 10,000 total records")
    all_results = []
    for item in payload:
        response = await predict(item, context, db)
        all_results.extend(response["items"])
    return {"items": all_results, "count": len(all_results)}


@router.get("")
async def list_predictions(
    context: TenantContext = Depends(current_tenant),
    db: Session = Depends(get_db),
):
    require_permission(context, "read")
    records = db.query(PredictionRecord).filter(
        PredictionRecord.organization_id == context.organization_id
    ).order_by(PredictionRecord.created_at.desc()).all()
    return {"items": [{
        "id": item.id,
        "model_id": item.model_id,
        "dataset_id": item.dataset_id,
        "shipment_id": item.shipment_id,
        "probability": float(item.probability),
        "risk_level": item.risk_level,
        "prediction": item.prediction_json,
    } for item in records], "count": len(records)}
