from __future__ import annotations

import re
from typing import Dict

import pandas as pd


FIELD_ALIASES: Dict[str, tuple[str, ...]] = {
    "shipment_id": ("shipment_id", "tracking_id", "tracking_number", "parcel_id"),
    "order_id": ("order_id", "order_number"),
    "created_at": ("created_at", "shipment_date", "ship_date", "order_created_at", "created_date"),
    "promised_delivery_date": (
        "promised_delivery_date",
        "promised_delivery_time",
        "promised_date",
        "delivery_due_date",
        "expected_delivery_date",
        "expected_delivery",
    ),
    "actual_delivery_date": (
        "actual_delivery_date",
        "actual_delivery_time",
        "delivered_at",
        "delivery_date",
    ),
    "pickup_timestamp": ("pickup_timestamp", "pickup_time", "picked_up_at"),
    "dispatch_timestamp": ("dispatch_timestamp", "dispatched_at", "shipped_at"),
    "delivery_status": ("delivery_status", "status", "shipment_status"),
    "carrier": ("carrier", "carrier_name", "shipping_carrier", "courier"),
    "origin_warehouse": ("origin_warehouse", "warehouse", "warehouse_id"),
    "origin": ("origin", "origin_city", "origin_location"),
    "destination": ("destination", "destination_city", "destination_location"),
    "shipping_method": ("shipping_method", "shipping_service", "service_level"),
    "shipment_weight": ("shipment_weight", "weight", "weight_kg"),
    "shipping_cost": ("shipping_cost", "cost", "shipping_amount"),
    "transit_days": ("transit_days", "delivery_days"),
    "distance": ("distance", "distance_km", "distance_miles"),
    "delay_reason": ("delay_reason", "exception_reason"),
}


def _normalized_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")


def suggest_column_mapping(columns: list[str]) -> dict[str, str]:
    normalized_columns: dict[str, str] = {}
    for column in columns:
        normalized_columns.setdefault(_normalized_name(column), column)

    suggestions: dict[str, str] = {}
    for field, aliases in FIELD_ALIASES.items():
        for alias in aliases:
            source = normalized_columns.get(_normalized_name(alias))
            if source is not None:
                suggestions[field] = source
                break
    return suggestions


def apply_column_mapping(
    dataframe: pd.DataFrame, mapping: dict[str, str]
) -> pd.DataFrame:
    if not mapping:
        return dataframe

    rename_map = {source: field for field, source in mapping.items() if source != field}
    mapped_fields = set(rename_map.values())
    collisions = mapped_fields.intersection(set(dataframe.columns) - set(rename_map))
    if collisions:
        raise ValueError(
            "Column mapping would overwrite existing columns: "
            + ", ".join(sorted(collisions))
        )
    return dataframe.rename(columns=rename_map)
