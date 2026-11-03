from __future__ import annotations

from typing import Dict, List

import pandas as pd


class AnalysisService:
    @staticmethod
    def _choose_column(df: pd.DataFrame, candidates: List[str]) -> str | None:
        for candidate in candidates:
            if candidate in df.columns:
                return candidate
        return None

    @staticmethod
    def analyze_dataframe(df: pd.DataFrame) -> Dict[str, object]:
        summary: Dict[str, object] = {
            "total_shipments": int(len(df)),
            "missing_value_summary": {str(k): int(v) for k, v in df.isna().sum().items()},
            "data_quality_summary": {
                "duplicate_rows": int(df.duplicated().sum()),
                "null_rows": int(df.isna().any(axis=1).sum()),
            },
        }

        carrier_col = AnalysisService._choose_column(df, ["carrier", "carrier_name", "shipping_carrier"])
        warehouse_col = AnalysisService._choose_column(df, ["origin_warehouse", "warehouse", "warehouse_id"])
        destination_col = AnalysisService._choose_column(df, ["destination", "destination_city", "destination_warehouse"])
        created_at_col = AnalysisService._choose_column(df, ["created_at", "shipment_date", "order_created_at"])
        promised_col = AnalysisService._choose_column(
            df, ["promised_delivery_date", "promised_delivery_time", "promised_date", "delivery_due_date"]
        )
        actual_col = AnalysisService._choose_column(
            df, ["actual_delivery_date", "actual_delivery_time", "delivered_at", "delivery_date"]
        )
        status_col = AnalysisService._choose_column(df, ["status", "delivery_status"])

        delivered_mask = None
        late_mask = None
        on_time_mask = None
        if promised_col and actual_col:
            promised = pd.to_datetime(df[promised_col], errors="coerce", format="mixed")
            actual = pd.to_datetime(df[actual_col], errors="coerce", format="mixed")
            delivered_mask = promised.notna() & actual.notna()
            late_mask = delivered_mask & (actual > promised)
            on_time_mask = delivered_mask & (actual <= promised)
            delay_hours = (actual - promised).dt.total_seconds() / 3600
            summary["delivered_shipments"] = int(delivered_mask.sum())
            summary["late_shipments"] = int(late_mask.sum())
            summary["on_time_shipments"] = int(on_time_mask.sum())
            summary["delay_rate"] = (
                round(int(late_mask.sum()) / int(delivered_mask.sum()) * 100, 2)
                if delivered_mask.any()
                else None
            )
            summary["on_time_delivery_percentage"] = (
                round(int(on_time_mask.sum()) / int(delivered_mask.sum()) * 100, 2)
                if delivered_mask.any()
                else None
            )
            late_delays = delay_hours[late_mask]
            summary["average_delay_duration_hours"] = (
                round(float(late_delays.mean()), 2) if not late_delays.empty else None
            )
            summary["delivery_metric_sample_count"] = int(delivered_mask.sum())
            summary["undelivered_or_missing_delivery_dates"] = int((~delivered_mask).sum())
            distribution = delay_hours[delivered_mask].describe().to_dict()
            summary["delay_distribution"] = {
                str(key): float(value)
                for key, value in distribution.items()
                if pd.notna(value)
            }
        elif status_col:
            status = df[status_col].fillna("").astype(str).str.strip().str.lower()
            on_time_mask = status.str.contains(
                r"on[\s_-]?time|not[\s_-]?(?:late|delayed)", regex=True
            )
            late_mask = status.str.contains(r"\blate\b|delayed|delay", regex=True) & ~on_time_mask
            classified_mask = late_mask | on_time_mask
            delivered_status = status.str.contains(r"\bdelivered\b|\bdelivering\b", regex=True)
            delivered_status &= ~status.str.contains(r"\bnot[\s_-]+delivered\b|undelivered", regex=True)
            delivered_mask = classified_mask | delivered_status
            sample_count = int(classified_mask.sum())
            delivered_count = int(delivered_mask.sum())
            late_count = int(late_mask.sum())
            on_time_count = int(on_time_mask.sum())
            summary["delivered_shipments"] = delivered_count
            summary["late_shipments"] = late_count
            summary["on_time_shipments"] = on_time_count
            summary["delivery_metric_sample_count"] = sample_count
            summary["undelivered_or_unclassified_shipments"] = int((~delivered_mask).sum())
            summary["delay_rate"] = (
                round(late_count / sample_count * 100, 2) if sample_count else None
            )
            summary["on_time_delivery_percentage"] = (
                round(on_time_count / sample_count * 100, 2) if sample_count else None
            )

        if created_at_col:
            created_at = pd.to_datetime(df[created_at_col], errors="coerce", format="mixed")
            valid_created_at = created_at.notna()
            daily = created_at[valid_created_at].dt.date.value_counts().sort_index().rename_axis("date").reset_index(name="shipments")
            daily.columns = ["date", "shipments"]
            daily["date"] = daily["date"].astype(str)
            summary["daily_trends"] = daily.to_dict(orient="records")
            monthly = (
                created_at[valid_created_at]
                .dt.to_period("M")
                .astype(str)
                .value_counts()
                .sort_index()
                .rename_axis("month")
                .reset_index(name="shipments")
            )
            summary["monthly_trends"] = monthly.to_dict(orient="records")
            summary["shipments_with_valid_created_at"] = int(valid_created_at.sum())

        if carrier_col:
            summary["carrier_performance"] = AnalysisService._segment_performance(
                df, carrier_col, delivered_mask, late_mask, on_time_mask
            )
        if warehouse_col:
            summary["warehouse_performance"] = AnalysisService._segment_performance(
                df, warehouse_col, delivered_mask, late_mask, on_time_mask
            )
        if destination_col:
            summary["destination_performance"] = AnalysisService._segment_performance(
                df, destination_col, delivered_mask, late_mask, on_time_mask
            )

        chart_ready = {
            "carrier_performance": summary.get("carrier_performance", []),
            "warehouse_performance": summary.get("warehouse_performance", []),
            "destination_performance": summary.get("destination_performance", []),
            "daily_trends": summary.get("daily_trends", []),
            "monthly_trends": summary.get("monthly_trends", []),
        }
        if "delay_distribution" in summary:
            chart_ready["delay_distribution"] = summary["delay_distribution"]
        return {"summary": summary, "chart_ready": chart_ready}

    @staticmethod
    def _segment_performance(
        df: pd.DataFrame,
        column: str,
        delivered_mask: pd.Series | None,
        late_mask: pd.Series | None,
        on_time_mask: pd.Series | None,
    ) -> List[dict]:
        performance = []
        for value, group in df.groupby(column, dropna=True, sort=True):
            entry = {"name": str(value), "shipments": int(len(group))}
            if delivered_mask is not None and late_mask is not None and on_time_mask is not None:
                indices = group.index
                delivered_count = int(delivered_mask.loc[indices].sum())
                late_count = int(late_mask.loc[indices].sum())
                on_time_count = int(on_time_mask.loc[indices].sum())
                classified_count = late_count + on_time_count
                entry.update({
                    "delivered_shipments": delivered_count,
                    "late_shipments": late_count,
                    "on_time_shipments": on_time_count,
                    "delivery_metric_sample_count": classified_count,
                    "delay_rate": round(late_count / classified_count * 100, 2) if classified_count else None,
                    "on_time_delivery_percentage": round(on_time_count / classified_count * 100, 2) if classified_count else None,
                })
            performance.append(entry)
        return performance
