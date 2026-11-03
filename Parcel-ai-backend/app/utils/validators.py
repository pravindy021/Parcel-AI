from __future__ import annotations

import re
from typing import Any


def is_valid_shipment_id(value: Any) -> bool:
    if value is None:
        return False
    text = str(value).strip()
    return bool(text) and re.fullmatch(r"[A-Za-z0-9\-_.]+", text) is not None


def safe_float(value: Any) -> float:
    if value is None or value == "":
        return float("nan")
    return float(value)
