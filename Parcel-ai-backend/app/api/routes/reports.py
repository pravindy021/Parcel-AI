from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import current_tenant
from app.db.database import get_db
from app.db.models import AnalysisReport, DatasetValidationReport, UploadedDataset
from app.services.auth import TenantContext, require_permission

router = APIRouter(prefix="/reports")


@router.get("/{report_id}")
async def get_report(
    report_id: str,
    context: TenantContext = Depends(current_tenant),
    db: Session = Depends(get_db),
):
    require_permission(context, "read")
    validation = db.query(DatasetValidationReport).join(
        UploadedDataset, UploadedDataset.id == DatasetValidationReport.dataset_id
    ).filter(
        DatasetValidationReport.id == report_id,
        DatasetValidationReport.organization_id == context.organization_id,
        UploadedDataset.organization_id == context.organization_id,
    ).first()
    analysis = db.query(AnalysisReport).join(
        UploadedDataset, UploadedDataset.id == AnalysisReport.dataset_id
    ).filter(
        AnalysisReport.id == report_id,
        AnalysisReport.organization_id == context.organization_id,
        UploadedDataset.organization_id == context.organization_id,
    ).first()
    report = validation or analysis
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if validation:
        return {
            "report_id": validation.id,
            "type": "validation",
            "dataset_id": validation.dataset_id,
            "status": validation.status,
            "summary": {
                "total_records": validation.total_records,
                "valid_records": validation.valid_records,
                "invalid_records": validation.invalid_records,
                "missing_values": validation.missing_values,
                "duplicate_records": validation.duplicate_records,
                "warnings": validation.warnings,
                "errors": validation.errors,
            },
        }
    return {
        "report_id": analysis.id,
        "type": "analysis",
        "dataset_id": analysis.dataset_id,
        "status": "ready",
        "summary": analysis.summary,
        "chart_ready": analysis.chart_ready,
    }


@router.get("/{report_id}/download")
async def download_report(
    report_id: str,
    context: TenantContext = Depends(current_tenant),
    db: Session = Depends(get_db),
):
    require_permission(context, "read")
    validation = db.query(DatasetValidationReport).join(
        UploadedDataset, UploadedDataset.id == DatasetValidationReport.dataset_id
    ).filter(
        DatasetValidationReport.id == report_id,
        DatasetValidationReport.organization_id == context.organization_id,
        UploadedDataset.organization_id == context.organization_id,
    ).first()
    analysis = db.query(AnalysisReport).join(
        UploadedDataset, UploadedDataset.id == AnalysisReport.dataset_id
    ).filter(
        AnalysisReport.id == report_id,
        AnalysisReport.organization_id == context.organization_id,
        UploadedDataset.organization_id == context.organization_id,
    ).first()
    report = validation or analysis
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    payload = {
        "report_id": report.id,
        "dataset_id": report.dataset_id,
        "status": getattr(report, "status", "ready"),
        "summary": getattr(report, "summary", None) or {
            "total_records": report.total_records,
            "valid_records": report.valid_records,
            "invalid_records": report.invalid_records,
            "missing_values": report.missing_values,
            "duplicate_records": report.duplicate_records,
            "warnings": report.warnings,
            "errors": report.errors,
        },
        "chart_ready": getattr(report, "chart_ready", None),
    }
    return {"download": payload}
