from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class TrainModelRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    dataset_id: Optional[str] = None
    model_name: str = Field(default="shipment-delay-model", min_length=1, max_length=100)
    synthetic: bool = False
    records: List[Dict[str, Any]] = Field(default_factory=list, max_length=10_000)


class ModelVersionResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    id: str
    name: str
    model_type: str
    version: str
    metrics: Dict[str, Any]
    feature_columns: List[str]
