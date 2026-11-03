from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, model_validator

from app.services.column_mapping import FIELD_ALIASES


class UploadDatasetRequest(BaseModel):
    category: str = Field(..., description="Dataset category")
    description: Optional[str] = ""


class ColumnMappingRequest(BaseModel):
    mapping: Dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_mapping(self):
        unknown_fields = set(self.mapping) - set(FIELD_ALIASES)
        if unknown_fields:
            raise ValueError("Unsupported standardized fields: " + ", ".join(sorted(unknown_fields)))
        if any(not source.strip() for source in self.mapping.values()):
            raise ValueError("Source column names must not be empty")
        if len(set(self.mapping.values())) != len(self.mapping):
            raise ValueError("A source column can only be mapped once")
        return self


class DatasetMetadata(BaseModel):
    id: str
    filename: str
    stored_name: str
    category: str
    file_type: str
    size_bytes: int
    status: str
    description: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: str


class DatasetPreviewResponse(BaseModel):
    dataset_id: str
    rows: List[Dict[str, Any]]
    columns: List[str]
    total_rows: int
    total_columns: int


class ValidationReportResponse(BaseModel):
    dataset_id: str
    status: str
    total_records: int
    valid_records: int
    invalid_records: int
    missing_values: int
    duplicate_records: int
    warnings: List[str]
    errors: List[str]
    column_stats: Dict[str, Any]
