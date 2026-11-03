from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class PredictionInput(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_id: str
    dataset_id: Optional[str] = None
    shipment_id: Optional[str] = None
    records: List[Dict[str, Any]] = Field(default_factory=list, max_length=10_000)


class PredictionResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    id: str
    model_id: str
    dataset_id: Optional[str]
    shipment_id: Optional[str]
    probability: float
    risk_level: str
    prediction: Dict[str, Any]
