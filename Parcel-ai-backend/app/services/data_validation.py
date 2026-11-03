from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd

from app.utils.validators import is_valid_shipment_id


class DatasetValidationService:
    @staticmethod
    def _coerce_dataframe(file_path: str, file_type: str) -> pd.DataFrame:
        if file_type == ".csv":
            return pd.read_csv(file_path, on_bad_lines="error", encoding="utf-8-sig")
        if file_type == ".xlsx":
            return pd.read_excel(file_path)
        raise ValueError(f"Unsupported file type: {file_type}")

    @staticmethod
    def validate_dataframe(df: pd.DataFrame, required_columns: List[str] | None = None) -> Dict[str, Any]:
        errors: List[str] = []
        warnings: List[str] = []

        if df.empty:
            errors.append("The uploaded dataset is empty")
            return {
                "status": "failed",
                "total_records": 0,
                "valid_records": 0,
                "invalid_records": 0,
                "missing_values": 0,
                "duplicate_records": 0,
                "warnings": warnings,
                "errors": errors,
                "column_stats": {},
            }

        if required_columns:
            missing = [col for col in required_columns if col not in df.columns]
            if missing:
                errors.append(f"Missing required columns: {', '.join(missing)}")

        invalid_rows = pd.Series(False, index=df.index)
        if required_columns and any(col not in df.columns for col in required_columns):
            invalid_rows[:] = True

        duplicate_mask = df.duplicated()
        duplicate_records = int(duplicate_mask.sum())
        if duplicate_records:
            warnings.append(f"Detected {duplicate_records} duplicate rows")
            invalid_rows |= duplicate_mask

        missing_values = int(df.isna().sum().sum())
        if missing_values:
            warnings.append(f"Detected {missing_values} missing values")

        invalid_shipment_rows = 0
        if "shipment_id" in df.columns:
            bad = df["shipment_id"].apply(
                lambda value: pd.notna(value) and not is_valid_shipment_id(value)
            )
            invalid_shipment_rows = int(bad.sum())
            if invalid_shipment_rows:
                errors.append(f"Detected {invalid_shipment_rows} invalid shipment IDs")
                invalid_rows |= bad

        date_columns = [
            col for col in df.columns
            if "date" in col.lower() or "time" in col.lower() or col.lower().endswith("_at")
        ]
        for col in date_columns:
            parsed = pd.to_datetime(df[col], errors="coerce", format="mixed")
            bad = df[col].notna() & parsed.isna()
            invalid_count = int(bad.sum())
            if invalid_count:
                errors.append(
                    f"Column '{col}' contains {invalid_count} invalid date or timestamp values"
                )
                invalid_rows |= bad

        numeric_columns = [
            col for col in df.columns
            if any(token in col.lower() for token in ["weight", "distance", "cost", "amount", "delay", "days", "hours", "minutes"])
        ]
        for col in numeric_columns:
            numeric = pd.to_numeric(df[col], errors="coerce")
            bad = df[col].notna() & numeric.isna()
            invalid_numeric = int(bad.sum())
            if invalid_numeric:
                errors.append(f"Column '{col}' contains {invalid_numeric} non-numeric values")
                invalid_rows |= bad
            if any(token in col.lower() for token in ["weight", "distance", "cost", "amount"]):
                negative = numeric < 0
                negative_count = int(negative.sum())
                if negative_count:
                    errors.append(f"Column '{col}' contains {negative_count} negative values")
                    invalid_rows |= negative

        created_col = next(
            (col for col in ["created_at", "shipment_date", "order_created_at"] if col in df.columns),
            None,
        )
        promised_col = next(
            (col for col in ["promised_delivery_date", "promised_delivery_time", "promised_date", "delivery_due_date"] if col in df.columns),
            None,
        )
        actual_col = next(
            (col for col in ["actual_delivery_date", "actual_delivery_time", "delivered_at", "delivery_date"] if col in df.columns),
            None,
        )
        if created_col and promised_col:
            created = pd.to_datetime(df[created_col], errors="coerce", format="mixed")
            promised = pd.to_datetime(df[promised_col], errors="coerce", format="mixed")
            invalid_order = created.notna() & promised.notna() & (promised < created)
            count = int(invalid_order.sum())
            if count:
                errors.append(f"Found {count} promised delivery dates before shipment creation")
                invalid_rows |= invalid_order
        if created_col and actual_col:
            created = pd.to_datetime(df[created_col], errors="coerce", format="mixed")
            actual = pd.to_datetime(df[actual_col], errors="coerce", format="mixed")
            invalid_order = created.notna() & actual.notna() & (actual < created)
            count = int(invalid_order.sum())
            if count:
                errors.append(f"Found {count} actual delivery dates before shipment creation")
                invalid_rows |= invalid_order

        column_stats = {}
        for column in df.columns:
            column_stats[column] = {
                "dtype": str(df[column].dtype),
                "non_null": int(df[column].notna().sum()),
                "null_count": int(df[column].isna().sum()),
                "unique_values": int(df[column].nunique(dropna=True)),
            }

        valid_records = int((~invalid_rows).sum())

        overall_status = "passed" if not errors else "failed"
        if warnings and not errors:
            overall_status = "warning"

        return {
            "status": overall_status,
            "total_records": int(len(df)),
            "valid_records": valid_records,
            "invalid_records": int(len(df) - valid_records),
            "missing_values": missing_values,
            "duplicate_records": duplicate_records,
            "warnings": warnings,
            "errors": errors,
            "column_stats": column_stats,
        }

    @staticmethod
    def validate_file(file_path: str, file_type: str, required_columns: List[str] | None = None) -> Dict[str, Any]:
        df = DatasetValidationService._coerce_dataframe(file_path, file_type)
        return DatasetValidationService.validate_dataframe(df, required_columns)
