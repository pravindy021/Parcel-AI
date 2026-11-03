from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()


@router.get("/config")
def read_public_config() -> dict:
    return {
        "api_prefix": settings.api_prefix,
        "max_upload_size_mb": settings.max_upload_size_mb,
        "max_dataset_rows": settings.max_dataset_rows,
        "max_dataset_columns": settings.max_dataset_columns,
        "max_preview_rows": 50,
        "supported_file_types": [".csv", ".xlsx"],
    }
