from __future__ import annotations

import logging
import json
import uuid
from zipfile import BadZipFile

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from openpyxl.utils.exceptions import InvalidFileException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.db.database import get_db
from app.db.models import AnalysisReport, DatasetValidationReport, UploadedDataset
from app.api.dependencies import current_tenant
from app.schemas.dataset import ColumnMappingRequest
from app.services.auth import TenantContext, require_permission
from app.services.analysis import AnalysisService
from app.services.column_mapping import FIELD_ALIASES, apply_column_mapping, suggest_column_mapping
from app.services.data_validation import DatasetValidationService
from app.services.file_storage import (
    InvalidUploadContentError,
    UnsupportedFileTypeError,
    UploadTooLargeError,
    persist_upload,
    stored_upload_path,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/datasets")


def _owned_dataset(db: Session, dataset_id: str, context: TenantContext) -> UploadedDataset:
    dataset = db.query(UploadedDataset).filter(
        UploadedDataset.id == dataset_id,
        UploadedDataset.organization_id == context.organization_id,
    ).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


def _dataset_to_response(dataset: UploadedDataset) -> dict:
    try:
        metadata = json.loads(dataset.metadata_json or "{}")
    except (TypeError, json.JSONDecodeError):
        metadata = {}
    return {
        "id": dataset.id,
        "filename": dataset.filename,
        "stored_name": dataset.stored_name,
        "category": dataset.category,
        "file_type": dataset.file_type,
        "size_bytes": dataset.size_bytes,
        "status": dataset.status,
        "description": dataset.description,
        "metadata": metadata,
        "created_at": dataset.created_at.isoformat() if dataset.created_at else None,
    }


@router.post("/upload")
async def upload_dataset(
    file: UploadFile = File(...),
    category: str = Form(default="historical_shipment_records", max_length=100),
    description: str = Form(default="", max_length=1000),
    context: TenantContext = Depends(current_tenant),
    db: Session = Depends(get_db),
):
    require_permission(context, "write")
    try:
        stored_name, stored_path, metadata = await run_in_threadpool(
            persist_upload, file, category, description
        )
    except UnsupportedFileTypeError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except UploadTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except InvalidUploadContentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    dataset_id = str(uuid.uuid4())
    dataset = UploadedDataset(
        id=dataset_id,
        organization_id=context.organization_id,
        owner_user_id=context.user_id,
        filename=metadata["filename"],
        stored_name=stored_name,
        category=category,
        file_type=metadata["file_type"],
        size_bytes=metadata["size_bytes"],
        status="uploaded",
        description=description,
        metadata_json="{}",
    )
    db.add(dataset)
    try:
        db.commit()
        db.refresh(dataset)
    except SQLAlchemyError as exc:
        db.rollback()
        stored_path.unlink(missing_ok=True)
        logger.exception("Could not save uploaded dataset metadata")
        raise HTTPException(status_code=503, detail="Dataset could not be saved") from exc
    return _dataset_to_response(dataset)


def _read_raw_dataset(dataset: UploadedDataset) -> pd.DataFrame:
    try:
        file_path = stored_upload_path(dataset.stored_name)
    except ValueError as exc:
        logger.error("Dataset %s has an invalid stored-file reference", dataset.id)
        raise HTTPException(status_code=404, detail="Stored dataset file is missing") from exc
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Stored dataset file is missing")
    try:
        return DatasetValidationService._coerce_dataframe(str(file_path), dataset.file_type)
    except (UnicodeDecodeError, pd.errors.ParserError, pd.errors.EmptyDataError, BadZipFile, InvalidFileException, OSError, ValueError) as exc:
        logger.warning("Stored dataset %s could not be parsed", dataset.id)
        raise HTTPException(status_code=422, detail="Stored dataset content is invalid or unreadable") from exc


def _read_dataset(dataset: UploadedDataset) -> pd.DataFrame:
    dataframe = _read_raw_dataset(dataset)
    try:
        metadata = json.loads(dataset.metadata_json or "{}")
        mapping = metadata.get("column_mapping", {})
        return apply_column_mapping(dataframe, mapping)
    except (TypeError, json.JSONDecodeError, ValueError) as exc:
        logger.error("Dataset %s has invalid column mapping metadata", dataset.id)
        raise HTTPException(status_code=422, detail="Dataset column mapping is invalid") from exc


@router.get("")
async def list_datasets(
    context: TenantContext = Depends(current_tenant),
    db: Session = Depends(get_db),
):
    require_permission(context, "read")
    datasets = db.query(UploadedDataset).filter(
        UploadedDataset.organization_id == context.organization_id
    ).order_by(UploadedDataset.created_at.desc()).all()
    return {"items": [_dataset_to_response(item) for item in datasets], "count": len(datasets)}


@router.get("/{dataset_id}")
async def get_dataset(
    dataset_id: str,
    context: TenantContext = Depends(current_tenant),
    db: Session = Depends(get_db),
):
    require_permission(context, "read")
    dataset = _owned_dataset(db, dataset_id, context)
    return _dataset_to_response(dataset)


@router.get("/{dataset_id}/preview")
async def dataset_preview(
    dataset_id: str,
    limit: int = Query(default=10, ge=1, le=50),
    context: TenantContext = Depends(current_tenant),
    db: Session = Depends(get_db),
):
    require_permission(context, "read")
    dataset = _owned_dataset(db, dataset_id, context)
    df = await run_in_threadpool(_read_dataset, dataset)
    preview = json.loads(df.head(limit).to_json(orient="records", date_format="iso"))
    return {"dataset_id": dataset_id, "rows": preview, "columns": list(df.columns), "total_rows": int(len(df)), "total_columns": int(len(df.columns))}


@router.get("/{dataset_id}/columns")
async def dataset_columns(
    dataset_id: str,
    context: TenantContext = Depends(current_tenant),
    db: Session = Depends(get_db),
):
    require_permission(context, "read")
    dataset = _owned_dataset(db, dataset_id, context)
    dataframe = await run_in_threadpool(_read_raw_dataset, dataset)
    columns = [str(column) for column in dataframe.columns]
    metadata = _dataset_to_response(dataset)["metadata"]
    return {
        "dataset_id": dataset_id,
        "columns": columns,
        "suggested_mapping": suggest_column_mapping(columns),
        "column_mapping": metadata.get("column_mapping", {}),
        "standard_fields": list(FIELD_ALIASES),
    }


@router.put("/{dataset_id}/mapping")
async def update_dataset_mapping(
    dataset_id: str,
    payload: ColumnMappingRequest,
    context: TenantContext = Depends(current_tenant),
    db: Session = Depends(get_db),
):
    require_permission(context, "write")
    dataset = _owned_dataset(db, dataset_id, context)
    dataframe = await run_in_threadpool(_read_raw_dataset, dataset)
    missing_columns = sorted(set(payload.mapping.values()) - set(dataframe.columns))
    if missing_columns:
        raise HTTPException(
            status_code=422,
            detail="Source columns were not found in the dataset: " + ", ".join(missing_columns),
        )
    try:
        apply_column_mapping(dataframe, payload.mapping)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    metadata = _dataset_to_response(dataset)["metadata"]
    if payload.mapping:
        metadata["column_mapping"] = payload.mapping
    else:
        metadata.pop("column_mapping", None)
    dataset.metadata_json = json.dumps(metadata)
    try:
        db.commit()
        db.refresh(dataset)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not save dataset column mapping")
        raise HTTPException(status_code=503, detail="Dataset column mapping could not be saved") from exc
    return {
        "dataset_id": dataset_id,
        "column_mapping": payload.mapping,
        "mapped_columns": list(apply_column_mapping(dataframe, payload.mapping).columns),
    }


@router.delete("/{dataset_id}")
async def delete_dataset(
    dataset_id: str,
    context: TenantContext = Depends(current_tenant),
    db: Session = Depends(get_db),
):
    require_permission(context, "write")
    dataset = _owned_dataset(db, dataset_id, context)
    try:
        file_path = stored_upload_path(dataset.stored_name)
    except ValueError as exc:
        logger.error("Dataset %s has an invalid stored-file reference", dataset_id)
        raise HTTPException(status_code=404, detail="Stored dataset file is missing") from exc
    db.delete(dataset)
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not delete dataset metadata")
        raise HTTPException(status_code=503, detail="Dataset could not be deleted") from exc
    try:
        file_path.unlink(missing_ok=True)
    except OSError as exc:
        logger.exception("Dataset %s was removed from the database but its file could not be deleted", dataset_id)
        raise HTTPException(status_code=500, detail="Dataset record was deleted but its stored file could not be removed") from exc
    return {"deleted": True, "dataset_id": dataset_id}


@router.post("/{dataset_id}/validate")
async def validate_dataset(
    dataset_id: str,
    context: TenantContext = Depends(current_tenant),
    db: Session = Depends(get_db),
):
    require_permission(context, "write")
    dataset = _owned_dataset(db, dataset_id, context)

    required_columns = ["shipment_id", "carrier", "origin_warehouse", "destination", "created_at"]
    df = await run_in_threadpool(_read_dataset, dataset)
    result = await run_in_threadpool(
        DatasetValidationService.validate_dataframe, df, required_columns
    )
    report = DatasetValidationReport(
        id=str(uuid.uuid4()),
        organization_id=context.organization_id,
        dataset_id=dataset.id,
        status=result["status"],
        total_records=result["total_records"],
        valid_records=result["valid_records"],
        invalid_records=result["invalid_records"],
        missing_values=result["missing_values"],
        duplicate_records=result["duplicate_records"],
        warnings=result["warnings"],
        errors=result["errors"],
        column_stats=result["column_stats"],
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    dataset.status = "validated" if not result["errors"] else "needs_review"
    db.add(dataset)
    db.commit()
    return {
        "dataset_id": dataset_id,
        "report_id": report.id,
        "status": report.status,
        "total_records": report.total_records,
        "valid_records": report.valid_records,
        "invalid_records": report.invalid_records,
        "missing_values": report.missing_values,
        "duplicate_records": report.duplicate_records,
        "warnings": report.warnings,
        "errors": report.errors,
        "column_stats": report.column_stats,
    }


@router.get("/{dataset_id}/validation")
async def get_validation(
    dataset_id: str,
    context: TenantContext = Depends(current_tenant),
    db: Session = Depends(get_db),
):
    require_permission(context, "read")
    dataset = _owned_dataset(db, dataset_id, context)
    report = db.query(DatasetValidationReport).filter(DatasetValidationReport.dataset_id == dataset_id).order_by(DatasetValidationReport.generated_at.desc()).first()
    if not report:
        raise HTTPException(status_code=404, detail="Validation report not found")
    return {
        "dataset_id": dataset_id,
        "status": report.status,
        "total_records": report.total_records,
        "valid_records": report.valid_records,
        "invalid_records": report.invalid_records,
        "missing_values": report.missing_values,
        "duplicate_records": report.duplicate_records,
        "warnings": report.warnings,
        "errors": report.errors,
        "column_stats": report.column_stats,
    }


@router.post("/{dataset_id}/analyze")
async def analyze_dataset(
    dataset_id: str,
    context: TenantContext = Depends(current_tenant),
    db: Session = Depends(get_db),
):
    require_permission(context, "write")
    dataset = _owned_dataset(db, dataset_id, context)

    df = await run_in_threadpool(_read_dataset, dataset)
    result = await run_in_threadpool(AnalysisService.analyze_dataframe, df)
    report = AnalysisReport(
        id=str(uuid.uuid4()),
        organization_id=context.organization_id,
        dataset_id=dataset.id,
        summary=result["summary"],
        chart_ready=result["chart_ready"],
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return {"dataset_id": dataset_id, "report_id": report.id, "summary": report.summary, "chart_ready": report.chart_ready}


@router.get("/{dataset_id}/analysis")
async def get_analysis(
    dataset_id: str,
    context: TenantContext = Depends(current_tenant),
    db: Session = Depends(get_db),
):
    require_permission(context, "read")
    dataset = _owned_dataset(db, dataset_id, context)
    report = db.query(AnalysisReport).filter(AnalysisReport.dataset_id == dataset_id).order_by(AnalysisReport.generated_at.desc()).first()
    if not report:
        raise HTTPException(status_code=404, detail="Analysis report not found")
    return {"dataset_id": dataset_id, "summary": report.summary, "chart_ready": report.chart_ready}
