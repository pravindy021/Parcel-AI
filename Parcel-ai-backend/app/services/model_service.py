from __future__ import annotations

import uuid
from pathlib import Path
from typing import Dict, List

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from app.core.config import settings


def _choose_column(df: pd.DataFrame, candidates: List[str]) -> str | None:
    for c in candidates:
        if c in df.columns:
            return c
    return None


def _build_target(df: pd.DataFrame) -> pd.Series:
    promised = _choose_column(
        df, ["promised_delivery_date", "promised_delivery_time", "promised_date", "delivery_due_date"]
    )
    actual = _choose_column(
        df, ["actual_delivery_date", "actual_delivery_time", "delivered_at", "delivery_date"]
    )
    status = _choose_column(df, ["status", "delivery_status"])

    if promised and actual:
        promised_dates = pd.to_datetime(df[promised], errors="coerce", format="mixed")
        actual_dates = pd.to_datetime(df[actual], errors="coerce", format="mixed")
        valid = promised_dates.notna() & actual_dates.notna()
        target = pd.Series(pd.NA, index=df.index, dtype="boolean")
        target.loc[valid] = actual_dates.loc[valid] > promised_dates.loc[valid]
        return target

    if status:
        values = df[status].fillna("").astype(str).str.strip().str.lower()
        on_time = values.str.contains(
            r"on[\s_-]?time|not[\s_-]?(?:late|delayed)", regex=True
        )
        late = values.str.contains(r"\blate\b|delayed|delay", regex=True) & ~on_time
        target = pd.Series(pd.NA, index=df.index, dtype="boolean")
        target.loc[late] = True
        target.loc[on_time] = False
        return target

    raise ValueError("The dataset does not define a valid delay target from shipped/actual dates or status values.")


def _prepare_features(df: pd.DataFrame) -> pd.DataFrame:
    frame = df.copy()
    removable = [
        "shipment_id", "actual_delivery_date", "actual_delivery_time", "delivered_at",
        "delivery_date", "promised_delivery_date", "promised_date", "delivery_due_date",
        "status", "delivery_status", "shipment_status", "delivery_outcome", "is_late",
        "delay", "delay_hours", "delay_days", "days_late", "hours_late",
    ]
    frame = frame.drop(columns=[col for col in removable if col in frame.columns], errors="ignore")

    date_col = _choose_column(frame, ["created_at", "shipment_date", "order_created_at"])
    if date_col:
        frame[date_col] = pd.to_datetime(frame[date_col], errors="coerce", format="mixed")
        frame["day_of_week"] = frame[date_col].dt.dayofweek
        frame["month"] = frame[date_col].dt.month
        frame = frame.drop(columns=[date_col], errors="ignore")

    for col in frame.columns:
        if frame[col].dtype == "object":
            frame[col] = frame[col].where(frame[col].notna(), "missing").astype(str)
    return frame


def prepare_for_model_prediction(df: pd.DataFrame, feature_columns: List[str]) -> pd.DataFrame:
    frame = _prepare_features(df)
    missing_columns = [column for column in feature_columns if column not in frame.columns]
    if missing_columns:
        raise ValueError(
            "Missing required prediction features: " + ", ".join(missing_columns)
        )
    for col in list(frame.columns):
        if col not in feature_columns:
            frame = frame.drop(columns=[col], errors="ignore")
    return frame[feature_columns]


class ModelTrainingService:
    @staticmethod
    def generate_synthetic_dataset() -> pd.DataFrame:
        rng = pd.date_range("2024-01-01", periods=250, freq="D")
        rows = []
        for idx, d in enumerate(rng):
            carrier = ["UPS", "FedEx", "DHL", "XPO"][idx % 4]
            warehouse = ["WHS-1", "WHS-2", "WHS-3"][idx % 3]
            destination = ["NYC", "LAX", "MIA", "SEA"][idx % 4]
            weight = 5 + (idx % 20) * 1.5
            distance = 200 + (idx % 80) * 10
            created = d
            promised = created + pd.Timedelta(days=3)
            is_late = idx % 3 != 0
            if is_late:
                actual = promised + pd.Timedelta(hours=12 * (idx % 5 + 1))
            else:
                actual = promised - pd.Timedelta(hours=12 * (idx % 4 + 1))
            rows.append({
                "shipment_id": f"SYN-{idx:04d}",
                "carrier": carrier,
                "origin_warehouse": warehouse,
                "destination": destination,
                "shipping_service": "express" if idx % 2 == 0 else "standard",
                "weight_kg": weight,
                "distance_km": distance,
                "created_at": created,
                "promised_delivery_date": promised,
                "actual_delivery_date": actual,
                "status": "late" if is_late else "on_time",
            })
        return pd.DataFrame(rows)

    @staticmethod
    def evaluate_model(model, X_test: pd.DataFrame, y_test: pd.Series) -> Dict[str, object]:
        proba = model.predict_proba(X_test)[:, 1]
        predictions = model.predict(X_test)
        metrics = {
            "accuracy": round(float(accuracy_score(y_test, predictions)), 4),
            "precision": round(float(precision_score(y_test, predictions, zero_division=0)), 4),
            "recall": round(float(recall_score(y_test, predictions, zero_division=0)), 4),
            "f1_score": round(float(f1_score(y_test, predictions, zero_division=0)), 4),
            "roc_auc": round(float(roc_auc_score(y_test, proba)), 4) if len(set(y_test)) > 1 else None,
            "confusion_matrix": confusion_matrix(y_test, predictions).tolist(),
        }
        return metrics

    @staticmethod
    def train(df: pd.DataFrame, model_name: str = "shipment-delay-model") -> Dict[str, object]:
        promised_column = _choose_column(
            df, ["promised_delivery_date", "promised_delivery_time", "promised_date", "delivery_due_date"]
        )
        actual_column = _choose_column(
            df, ["actual_delivery_date", "actual_delivery_time", "delivered_at", "delivery_date"]
        )
        target = _build_target(df)
        valid_target = target.notna()
        training_df = df.loc[valid_target].copy()
        target = target.loc[valid_target].astype(bool)

        created_at_col = _choose_column(
            training_df, ["created_at", "shipment_date", "order_created_at"]
        )
        if created_at_col:
            created_at = pd.to_datetime(
                training_df[created_at_col], errors="coerce", format="mixed"
            )
            valid_created_at = created_at.notna()
            training_df = training_df.loc[valid_created_at].copy()
            target = target.loc[valid_created_at]
            created_at = created_at.loc[valid_created_at]

        frame = _prepare_features(training_df)
        feature_columns = list(frame.columns)

        if not feature_columns:
            raise ValueError("No prediction-time features remain after removing target and post-delivery columns.")
        if len(frame) < 20 or target.nunique() < 2:
            raise ValueError("Not enough valid target data to train a meaningful delay model.")

        X = frame[feature_columns]
        y = target
        if created_at_col:
            ordered_indices = created_at.sort_values(kind="stable").index
            split_index = int(len(ordered_indices) * 0.75)
            train_indices = ordered_indices[:split_index]
            test_indices = ordered_indices[split_index:]
            X_train, X_test = X.loc[train_indices], X.loc[test_indices]
            y_train, y_test = y.loc[train_indices], y.loc[test_indices]
            validation_strategy = "chronological_holdout"
        else:
            if y.value_counts().min() < 2:
                raise ValueError("At least two examples per delay class are required for evaluation.")
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.25, random_state=42, stratify=y
            )
            validation_strategy = "stratified_random_holdout"
        if y_train.nunique() < 2:
            raise ValueError("The training split must contain both on-time and delayed shipments.")

        cat_columns = X_train.select_dtypes(include=["object"]).columns.tolist()
        num_columns = [col for col in X_train.columns if col not in cat_columns]

        numeric_transform = Pipeline([
            ("imputer", SimpleImputer(strategy="median", keep_empty_features=True))
        ])
        categorical_transform = Pipeline([
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ])

        preprocessor = ColumnTransformer([
            ("num", numeric_transform, num_columns),
            ("cat", categorical_transform, cat_columns),
        ])

        candidate_models = {
            "logistic_regression": LogisticRegression(
                max_iter=1000,
                class_weight="balanced",
                solver="liblinear",
                random_state=42,
            ),
            "random_forest": RandomForestClassifier(n_estimators=100, random_state=42, class_weight="balanced"),
        }

        best_model = None
        best_name = None
        best_metrics = None
        for name, estimator in candidate_models.items():
            pipeline = Pipeline([
                ("preprocessor", preprocessor),
                ("model", estimator),
            ])
            pipeline.fit(X_train, y_train)
            metrics = ModelTrainingService.evaluate_model(pipeline, X_test, y_test)
            if best_metrics is None or metrics["f1_score"] > best_metrics["f1_score"]:
                best_model = pipeline
                best_name = name
                best_metrics = metrics

        if best_model is None:
            raise ValueError("Unable to train a valid delay model")

        best_metrics["validation_strategy"] = validation_strategy
        best_metrics["target_definition"] = (
            f"{actual_column} > {promised_column}"
            if actual_column and promised_column
            else "explicit late/delayed status versus on-time status"
        )
        if hasattr(best_model.named_steps["model"], "feature_importances_"):
            importance_values = best_model.named_steps["model"].feature_importances_
            importance_kind = "tree_feature_importance"
        else:
            importance_values = abs(best_model.named_steps["model"].coef_[0])
            importance_kind = "absolute_linear_coefficient"
        transformed_features = best_model.named_steps["preprocessor"].get_feature_names_out()
        top_features = sorted(
            zip(transformed_features, importance_values, strict=True),
            key=lambda item: float(item[1]),
            reverse=True,
        )[:20]
        best_metrics["feature_importance_kind"] = importance_kind
        best_metrics["feature_importance"] = [
            {"feature": str(name), "importance": round(float(value), 6)}
            for name, value in top_features
        ]

        model_dir = Path(settings.model_dir)
        model_dir.mkdir(parents=True, exist_ok=True)
        artifact = model_dir / f"{uuid.uuid4().hex}.joblib"
        joblib.dump(best_model, artifact)

        return {
            "model_id": str(uuid.uuid4()),
            "name": model_name,
            "model_type": best_name,
            "version": "v1",
            "artifact_path": str(artifact),
            "metrics": best_metrics,
            "feature_columns": feature_columns,
        }
