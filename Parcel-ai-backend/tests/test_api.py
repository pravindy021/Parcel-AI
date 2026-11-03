from io import BytesIO
import uuid

import pandas as pd
import pytest
from datetime import timedelta
from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlalchemy.exc import SQLAlchemyError
from starlette.datastructures import UploadFile

from app.api.routes import health
from app.api.routes import models as model_routes
from app.core.config import settings
from app.db.database import SessionLocal
from app.db.models import (
    AuthSession,
    EmailActionToken,
    Organization,
    OrganizationInvitation,
    OrganizationMembership,
    UploadedDataset,
    User,
)
from app.main import app
from app.services.auth import (
    CSRF_COOKIE,
    create_email_action,
    create_organization_for_user,
    hash_password,
    token_digest,
    utcnow,
)
from app.services.analysis import AnalysisService
from app.services.data_validation import DatasetValidationService
from app.services.file_storage import UploadTooLargeError, stored_upload_path, validate_upload
from app.services.model_service import ModelTrainingService, _build_target, _prepare_features


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        db = SessionLocal()
        identity = uuid.uuid4().hex
        user = User(
            id=f"test-default-user-{identity}",
            email=f"test-default-{identity}@example.test",
            display_name="Test User",
            password_hash=hash_password("test-password-123"),
            email_verified_at=utcnow(),
        )
        db.add(user)
        organization = create_organization_for_user(
            db, user, "Test Workspace", f"test-workspace-{identity}"
        )
        email = user.email
        organization_id = organization.id
        db.commit()
        db.close()
        response = test_client.post(
            "/api/auth/login",
            json={"email": email, "password": "test-password-123"},
        )
        assert response.status_code == 200
        csrf = test_client.cookies.get(CSRF_COOKIE)
        assert csrf
        test_client.headers.update({"X-CSRF-Token": csrf, "X-Organization-ID": organization_id})
        yield test_client


@pytest.fixture(scope="module")
def trained_model(client):
    response = client.post(
        "/api/models/train",
        json={"model_name": "synthetic-demo", "synthetic": True},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _csv_file(rows, filename="sample.csv"):
    data = pd.DataFrame(rows).to_csv(index=False).encode("utf-8")
    return {"file": (filename, BytesIO(data), "text/csv")}


def _create_verified_identity(email, organization_name="Security Test Org"):
    db = SessionLocal()
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        display_name=email.split("@", 1)[0],
        password_hash=hash_password("security-test-password-123"),
        email_verified_at=utcnow(),
    )
    db.add(user)
    organization = create_organization_for_user(
        db, user, organization_name, f"security-{uuid.uuid4().hex}"
    )
    user_id = user.id
    organization_id = organization.id
    db.commit()
    db.close()
    return user_id, organization_id


def _sign_in(client, email, organization_id):
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": "security-test-password-123"},
    )
    assert response.status_code == 200, response.text
    csrf = client.cookies.get(CSRF_COOKIE)
    client.headers.update({"X-CSRF-Token": csrf, "X-Organization-ID": organization_id})
    return response


def _prediction_record(shipment_id="P1"):
    return {
        "shipment_id": shipment_id,
        "carrier": "UPS",
        "origin_warehouse": "WHS-1",
        "destination": "NYC",
        "shipping_service": "express",
        "weight_kg": 12,
        "distance_km": 500,
        "created_at": "2024-04-15",
        "day_of_week": 6,
        "month": 4,
    }


def test_root_health_and_openapi(client):
    assert client.get("/").status_code == 200
    health_response = client.get("/health")
    assert health_response.status_code == 200
    assert health_response.json() == {
        "status": "healthy",
        "service": "parcel-ai-backend",
        "database": "available",
    }
    assert client.get("/openapi.json").status_code == 200
    assert client.get("/docs").status_code == 200


def test_public_config_matches_supported_upload_contract(client):
    response = client.get("/api/config")
    assert response.status_code == 200
    config = response.json()
    assert config["api_prefix"] == "/api"
    assert config["max_upload_size_mb"] == settings.max_upload_size_mb
    assert config["supported_file_types"] == [".csv", ".xlsx"]
    assert config["max_preview_rows"] == 50


def test_auth_registration_verification_login_logout_and_session_expiry():
    with TestClient(app) as auth_client:
        email = f"auth-{uuid.uuid4().hex}@example.test"
        registration = auth_client.post(
            "/api/auth/register",
            json={
                "email": email,
                "password": "strong-password-123",
                "display_name": "Auth Test",
                "organization_name": "Auth Test Workspace",
            },
        )
        assert registration.status_code == 201
        assert registration.json()["email_verification_required"] is True
        assert registration.json()["email_delivery"] == "not_configured"
        db = SessionLocal()
        user = db.query(User).filter(User.email == email).first()
        assert user and user.password_hash != "strong-password-123"
        assert user.email_verified_at is None
        user_id = user.id
        action, raw_token = create_email_action(db, user, "verify_email")
        db.commit()
        db.close()
        assert auth_client.post(
            "/api/auth/login",
            json={"email": email, "password": "strong-password-123"},
        ).status_code == 403

        verified = auth_client.post("/api/auth/verify-email", json={"token": raw_token})
        assert verified.status_code == 200
        assert auth_client.post("/api/auth/verify-email", json={"token": raw_token}).status_code == 400

        login_response = auth_client.post(
            "/api/auth/login",
            json={"email": email, "password": "strong-password-123"},
        )
        assert login_response.status_code == 200
        assert auth_client.cookies.get("parcel_ai_session")
        assert "httponly" in login_response.headers.get("set-cookie", "").lower()
        assert auth_client.get("/api/auth/me").status_code == 200
        db = SessionLocal()
        session = db.query(AuthSession).filter(AuthSession.user_id == user_id).first()
        session.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
        db.close()
        assert auth_client.get("/api/datasets").status_code == 401


def test_login_rate_limit_and_unauthenticated_routes():
    with TestClient(app) as auth_client:
        assert auth_client.get("/api/datasets").status_code == 401
        for attempt in range(settings.login_max_attempts):
            response = auth_client.post(
                "/api/auth/login",
                json={"email": f"missing-{uuid.uuid4().hex}@example.test", "password": "incorrect-password"},
            )
            assert response.status_code == 401
        # A stable email/IP pair reaches the configured lockout threshold.
        email = f"rate-{uuid.uuid4().hex}@example.test"
        for _ in range(settings.login_max_attempts):
            auth_client.post(
                "/api/auth/login",
                json={"email": email, "password": "incorrect-password"},
            )
        assert auth_client.post(
            "/api/auth/login",
            json={"email": email, "password": "incorrect-password"},
        ).status_code == 429


def test_password_reset_revokes_existing_sessions_and_csrf_is_required():
    email = f"reset-{uuid.uuid4().hex}@example.test"
    user_id, organization_id = _create_verified_identity(email)
    with TestClient(app) as auth_client:
        _sign_in(auth_client, email, organization_id)
        assert auth_client.post(
            "/api/auth/change-password",
            headers={"X-CSRF-Token": ""},
            json={"current_password": "security-test-password-123", "new_password": "new-password-123"},
        ).status_code == 403
        db = SessionLocal()
        user = db.query(User).filter(User.id == user_id).first()
        _, raw_token = create_email_action(db, user, "reset_password")
        db.commit()
        db.close()
        reset = auth_client.post(
            "/api/auth/reset-password",
            json={"token": raw_token, "new_password": "new-password-456"},
        )
        assert reset.status_code == 200
        assert auth_client.get("/api/datasets").status_code == 401
        assert auth_client.post(
            "/api/auth/reset-password",
            json={"token": raw_token, "new_password": "new-password-789"},
        ).status_code == 400
        with TestClient(app) as new_client:
            login = new_client.post(
                "/api/auth/login",
                json={"email": email, "password": "new-password-456"},
            )
            assert login.status_code == 200


def test_cross_organization_dataset_access_preview_mapping_and_delete_are_denied(trained_model):
    user_a = f"tenant-a-{uuid.uuid4().hex}@example.test"
    user_b = f"tenant-b-{uuid.uuid4().hex}@example.test"
    _, organization_a = _create_verified_identity(user_a, "Tenant A")
    _, organization_b = _create_verified_identity(user_b, "Tenant B")
    with TestClient(app) as client_a, TestClient(app) as client_b:
        _sign_in(client_a, user_a, organization_a)
        _sign_in(client_b, user_b, organization_b)
        upload = client_a.post(
            "/api/datasets/upload",
            files=_csv_file([{"shipment_id": "TENANT-A-1", "carrier": "UPS"}]),
        )
        assert upload.status_code == 200
        dataset_id = upload.json()["id"]
        assert client_a.get(f"/api/datasets/{dataset_id}").status_code == 200
        assert client_b.get("/api/datasets").json()["count"] == 0
        assert client_b.get(f"/api/datasets/{dataset_id}").status_code == 404
        assert client_b.get(f"/api/datasets/{dataset_id}/preview").status_code == 404
        assert client_b.put(
            f"/api/datasets/{dataset_id}/mapping",
            json={"mapping": {"shipment_id": "shipment_id"}},
        ).status_code == 404
        assert client_b.delete(f"/api/datasets/{dataset_id}").status_code == 404
        assert client_b.get(f"/api/models/{trained_model['id']}").status_code == 404
        assert client_b.post(
            "/api/predictions",
            json={"model_id": trained_model["id"], "records": [_prediction_record()]},
        ).status_code == 404
        analysis = client_a.post(f"/api/datasets/{dataset_id}/analyze")
        assert analysis.status_code == 200
        report_id = analysis.json()["report_id"]
        assert client_b.get(f"/api/reports/{report_id}").status_code == 404
        assert client_b.get(f"/api/reports/{report_id}/download").status_code == 404
        assert client_a.get(f"/api/datasets/{dataset_id}").status_code == 200
        assert client_a.delete(f"/api/datasets/{dataset_id}").status_code == 200


def test_viewer_cannot_upload_or_delete_but_can_read_org_datasets():
    owner_email = f"owner-{uuid.uuid4().hex}@example.test"
    viewer_email = f"viewer-{uuid.uuid4().hex}@example.test"
    _, organization_id = _create_verified_identity(owner_email, "Role Test")
    db = SessionLocal()
    viewer = User(
        id=str(uuid.uuid4()),
        email=viewer_email,
        display_name="Viewer",
        password_hash=hash_password("security-test-password-123"),
        email_verified_at=utcnow(),
    )
    db.add(viewer)
    db.add(OrganizationMembership(
        id=str(uuid.uuid4()),
        organization_id=organization_id,
        user_id=viewer.id,
        role="viewer",
    ))
    db.commit()
    db.close()

    with TestClient(app) as owner_client, TestClient(app) as viewer_client:
        _sign_in(owner_client, owner_email, organization_id)
        _sign_in(viewer_client, viewer_email, organization_id)
        upload = owner_client.post(
            "/api/datasets/upload",
            files=_csv_file([{"shipment_id": "ROLE-1", "carrier": "DHL"}]),
        )
        dataset_id = upload.json()["id"]
        assert viewer_client.get(f"/api/datasets/{dataset_id}").status_code == 200
        assert viewer_client.post(
            "/api/datasets/upload",
            files=_csv_file([{"shipment_id": "ROLE-2"}]),
        ).status_code == 403
        assert viewer_client.delete(f"/api/datasets/{dataset_id}").status_code == 403


def test_health_reports_database_failure(client, monkeypatch):
    def database_unavailable():
        raise SQLAlchemyError("database secret/path must not leak")

    monkeypatch.setattr(health.engine, "connect", database_unavailable)
    response = client.get("/health")
    assert response.status_code == 503
    assert response.json()["database"] == "unavailable"
    assert "secret" not in response.text


def test_upload_and_preview_api(client):
    rows = [{
        "shipment_id": "S1",
        "carrier": "UPS",
        "origin_warehouse": "W1",
        "destination": "NYC",
        "created_at": "2024-01-01",
        "weight_kg": 10.5,
    }, {
        "shipment_id": "S2",
        "carrier": "FedEx",
        "origin_warehouse": "W2",
        "destination": "LAX",
        "created_at": "2024-01-02",
        "weight_kg": 12.0,
    }]
    response = client.post(
        "/api/datasets/upload",
        files=_csv_file(rows),
        data={"category": "historical_shipment_records", "description": "demo"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["metadata"] == {}
    assert "path" not in response.text
    dataset_id = response.json()["id"]
    dataset = client.get(f"/api/datasets/{dataset_id}")
    assert dataset.status_code == 200
    assert "path" not in dataset.text
    preview = client.get(f"/api/datasets/{dataset_id}/preview", params={"limit": 10})
    assert preview.status_code == 200
    assert preview.json()["total_rows"] == 2
    assert len(preview.json()["rows"]) == 2
    assert any(item["id"] == dataset_id for item in client.get("/api/datasets").json()["items"])
    assert client.delete(f"/api/datasets/{dataset_id}").json()["deleted"] is True
    assert client.get(f"/api/datasets/{dataset_id}").status_code == 404


def test_upload_sanitizes_unsafe_filename(client):
    response = client.post(
        "/api/datasets/upload",
        files=_csv_file(
            [{"shipment_id": "S1", "carrier": "UPS"}],
            filename="..\\..\\unsafe.csv",
        ),
    )
    assert response.status_code == 200
    assert ".." not in response.json()["filename"]
    assert "\\" not in response.json()["filename"]


def test_preview_serializes_missing_cells_as_null(client):
    response = client.post(
        "/api/datasets/upload",
        files=_csv_file([{"shipment_id": "S1", "carrier": None}]),
    )
    dataset_id = response.json()["id"]
    preview = client.get(f"/api/datasets/{dataset_id}/preview")
    assert preview.status_code == 200
    assert preview.json()["rows"][0]["carrier"] is None


def test_xlsx_upload_is_supported(client):
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.append(["shipment_id", "carrier"])
    worksheet.append(["S1", "UPS"])
    body = BytesIO()
    workbook.save(body)
    response = client.post(
        "/api/datasets/upload",
        files={"file": ("sample.xlsx", BytesIO(body.getvalue()), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert response.status_code == 200, response.text


def test_column_mapping_is_validated_persisted_and_used_in_preview(client):
    rows = [{
        "Tracking Number": "S-101",
        "Courier": "UPS",
        "Warehouse": "W1",
        "Destination City": "NYC",
        "Ship Date": "2024-01-01",
        "Expected Delivery": "2024-01-03",
        "Delivered At": "2024-01-04",
    }]
    upload = client.post("/api/datasets/upload", files=_csv_file(rows))
    assert upload.status_code == 200, upload.text
    dataset_id = upload.json()["id"]

    columns = client.get(f"/api/datasets/{dataset_id}/columns")
    assert columns.status_code == 200
    suggestions = columns.json()["suggested_mapping"]
    assert suggestions["shipment_id"] == "Tracking Number"
    assert suggestions["carrier"] == "Courier"
    assert suggestions["origin_warehouse"] == "Warehouse"

    invalid = client.put(
        f"/api/datasets/{dataset_id}/mapping",
        json={"mapping": {"shipment_id": "missing column"}},
    )
    assert invalid.status_code == 422

    mapping = suggestions
    saved = client.put(
        f"/api/datasets/{dataset_id}/mapping",
        json={"mapping": mapping},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["column_mapping"] == mapping

    metadata = client.get(f"/api/datasets/{dataset_id}")
    assert metadata.json()["metadata"]["column_mapping"] == mapping
    preview = client.get(f"/api/datasets/{dataset_id}/preview")
    assert preview.status_code == 200
    assert "shipment_id" in preview.json()["columns"]
    assert preview.json()["rows"][0]["shipment_id"] == "S-101"
    assert preview.json()["rows"][0]["promised_delivery_date"] == "2024-01-03"

    validation = client.post(f"/api/datasets/{dataset_id}/validate")
    assert validation.status_code == 200
    assert validation.json()["status"] == "passed"
    assert client.delete(f"/api/datasets/{dataset_id}").status_code == 200


@pytest.mark.parametrize(
    ("filename", "content", "content_type", "expected_status"),
    [
        ("bad.txt", b"hello", "text/plain", 415),
        ("empty.csv", b"", "text/csv", 422),
        ("malformed.csv", b'"unclosed header\nx,y\n', "text/csv", 422),
        ("broken.xlsx", b"not a workbook", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 422),
    ],
)
def test_upload_rejects_unsupported_or_corrupt_content(client, filename, content, content_type, expected_status):
    response = client.post(
        "/api/datasets/upload",
        files={"file": (filename, BytesIO(content), content_type)},
    )
    assert response.status_code == expected_status


def test_oversized_file_rejected(client):
    large_content = b"a" * (30 * 1024 * 1024)
    response = client.post(
        "/api/datasets/upload",
        files={"file": ("large.csv", BytesIO(large_content), "text/csv")},
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 413
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_csv_row_limit_is_enforced(monkeypatch):
    monkeypatch.setattr(settings, "max_dataset_rows", 1)
    upload = UploadFile(filename="two-rows.csv", file=BytesIO(b"id\n1\n2\n"))
    with pytest.raises(UploadTooLargeError, match="row limit"):
        validate_upload(upload)


def test_stored_dataset_paths_cannot_escape_upload_directory(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "uploads"))
    with pytest.raises(ValueError, match="Invalid stored dataset reference"):
        stored_upload_path("..\\outside.csv")


def test_validation_with_missing_columns(client):
    csv_data = b"shipment_id,carrier\nA1,UPS\nA2,FedEx\n"
    response = client.post(
        "/api/datasets/upload",
        files={"file": ("partial.csv", BytesIO(csv_data), "text/csv")},
    )
    dataset_id = response.json()["id"]
    validation = client.post(f"/api/datasets/{dataset_id}/validate")
    assert validation.status_code == 200
    assert "Missing required columns" in validation.json()["errors"][0]
    latest = client.get(f"/api/datasets/{dataset_id}/validation")
    assert latest.status_code == 200
    assert latest.json()["status"] == "failed"


def test_validation_identifies_invalid_dates_and_negative_values():
    frame = pd.DataFrame({
        "shipment_id": ["S1", "S2"],
        "created_at": ["not-a-date", "2024-01-01"],
        "promised_delivery_date": ["2024-01-02", "2023-12-31"],
        "actual_delivery_date": ["2024-01-03", "2024-01-02"],
        "weight_kg": [5, -2],
    })
    result = DatasetValidationService.validate_dataframe(frame)
    assert result["status"] == "failed"
    assert result["invalid_records"] == 2
    assert any("invalid date" in item for item in result["errors"])
    assert any("negative values" in item for item in result["errors"])
    assert any("promised delivery dates before" in item for item in result["errors"])


def test_validation_reports_missing_and_duplicate_rows():
    frame = pd.DataFrame({
        "shipment_id": ["S1", "S1", "S2"],
        "carrier": ["UPS", "UPS", None],
    })
    result = DatasetValidationService.validate_dataframe(frame)
    assert result["duplicate_records"] == 1
    assert result["missing_values"] == 1
    assert result["invalid_records"] == 1
    assert result["warnings"]


def test_analytics_excludes_undelivered_from_on_time_rate():
    frame = pd.DataFrame({
        "carrier": ["UPS", "UPS", "DHL"],
        "origin_warehouse": ["W1", "W1", "W2"],
        "destination": ["NYC", "NYC", "SEA"],
        "promised_delivery_date": ["2024-01-05", "2024-01-06", "2024-01-07"],
        "actual_delivery_date": ["2024-01-05", "2024-01-08", None],
    })
    summary = AnalysisService.analyze_dataframe(frame)["summary"]
    assert summary["total_shipments"] == 3
    assert summary["delivered_shipments"] == 2
    assert summary["on_time_shipments"] == 1
    assert summary["late_shipments"] == 1
    assert summary["on_time_delivery_percentage"] == 50
    assert summary["undelivered_or_missing_delivery_dates"] == 1
    ups = next(item for item in summary["carrier_performance"] if item["name"] == "UPS")
    assert ups["delay_rate"] == 50


def test_analytics_missing_metrics_are_not_fabricated():
    summary = AnalysisService.analyze_dataframe(pd.DataFrame({"shipment_id": ["S1"]}))["summary"]
    assert summary["total_shipments"] == 1
    assert "on_time_delivery_percentage" not in summary
    assert "delay_rate" not in summary


def test_status_based_analytics_uses_classifiable_deliveries():
    summary = AnalysisService.analyze_dataframe(
        pd.DataFrame({"delivery_status": ["on-time", "delayed", "in transit", "delivered"]})
    )["summary"]
    assert summary["delivered_shipments"] == 3
    assert summary["delivery_metric_sample_count"] == 2
    assert summary["delay_rate"] == 50
    assert summary["on_time_delivery_percentage"] == 50
    assert summary["undelivered_or_unclassified_shipments"] == 1


def test_empty_dataset_validation_and_analytics():
    validation = DatasetValidationService.validate_dataframe(pd.DataFrame())
    assert validation["status"] == "failed"
    assert validation["total_records"] == 0
    analysis = AnalysisService.analyze_dataframe(pd.DataFrame())["summary"]
    assert analysis["total_shipments"] == 0
    assert "delay_rate" not in analysis


def test_target_excludes_undelivered_and_post_delivery_features():
    frame = pd.DataFrame({
        "shipment_id": ["S1", "S2", "S3"],
        "carrier": ["UPS", "DHL", "FedEx"],
        "created_at": ["2024-01-01", "2024-01-02", "2024-01-03"],
        "promised_delivery_date": ["2024-01-05", "2024-01-06", "2024-01-07"],
        "actual_delivery_date": ["2024-01-06", None, "2024-01-07"],
        "status": ["late", "in_transit", "on_time"],
        "delay_hours": [24, None, 0],
    })
    target = _build_target(frame)
    assert target.iloc[0] == True
    assert pd.isna(target.iloc[1])
    assert target.iloc[2] == False
    features = _prepare_features(frame)
    assert "carrier" in features.columns
    assert not {"shipment_id", "actual_delivery_date", "status", "delay_hours"} & set(features.columns)


def test_target_accepts_explicit_status_only():
    target = _build_target(pd.DataFrame({
        "delivery_status": ["delayed", "on-time", "in transit", "not delayed"],
    }))
    assert target.iloc[0] == True
    assert target.iloc[1] == False
    assert pd.isna(target.iloc[2])
    assert target.iloc[3] == False


def test_target_accepts_promised_and_actual_delivery_times():
    frame = pd.DataFrame({
        "promised_delivery_time": ["2024-01-05 10:00", "2024-01-06 10:00"],
        "actual_delivery_time": ["2024-01-05 11:00", "2024-01-06 09:00"],
    })
    target = _build_target(frame)
    assert target.tolist() == [True, False]
    assert "actual_delivery_time" not in _prepare_features(frame).columns


def test_model_training_reports_validation_and_feature_importance(client, trained_model):
    metrics = trained_model["metrics"]
    assert metrics["training_data_source"] == "synthetic_demo"
    assert metrics["validation_strategy"] == "chronological_holdout"
    assert metrics["target_definition"] == "actual_delivery_date > promised_delivery_date"
    assert isinstance(metrics["feature_importance"], list)
    assert metrics["feature_importance"]
    assert "artifact_path" not in trained_model
    assert "artifact_path" not in str(metrics)
    assert client.get("/api/models").status_code == 200
    assert client.get(f"/api/models/{trained_model['id']}").status_code == 200


def test_synthetic_training_is_disabled_in_production(client, monkeypatch):
    monkeypatch.setattr(model_routes.settings, "environment", "production")
    response = client.post("/api/models/train", json={"synthetic": True})
    assert response.status_code == 403
    assert "synthetic" in response.json()["detail"].lower()


def test_frontend_dataset_training_and_prediction_workflow(client):
    records = []
    for index, created in enumerate(pd.date_range("2024-01-01", periods=40, freq="D")):
        promised = created + pd.Timedelta(days=3)
        actual = promised + pd.Timedelta(hours=12) if index % 2 else promised - pd.Timedelta(hours=12)
        records.append({
            "shipment_id": f"REAL-{index:03d}",
            "carrier": ["UPS", "DHL"][index % 2],
            "origin_warehouse": ["W1", "W2"][index % 2],
            "destination": ["NYC", "SEA"][index % 2],
            "shipping_service": "standard",
            "weight_kg": 10 + index,
            "distance_km": 200 + index * 10,
            "created_at": created.isoformat(),
            "promised_delivery_date": promised.isoformat(),
            "actual_delivery_date": actual.isoformat(),
        })
    upload = client.post("/api/datasets/upload", files=_csv_file(records))
    assert upload.status_code == 200, upload.text
    dataset_id = upload.json()["id"]
    trained = client.post("/api/models/train", json={"dataset_id": dataset_id})
    assert trained.status_code == 200, trained.text
    assert trained.json()["metrics"]["training_data_source"] != "synthetic_demo"
    predicted = client.post(
        "/api/predictions",
        json={"model_id": trained.json()["id"], "dataset_id": dataset_id},
    )
    assert predicted.status_code == 200, predicted.text
    assert predicted.json()["count"] == len(records)


def test_prediction_api_works(client, trained_model):
    response = client.post(
        "/api/predictions",
        json={"model_id": trained_model["id"], "records": [_prediction_record()]},
    )
    assert response.status_code == 200, response.text
    item = response.json()["items"][0]
    assert 0 <= item["probability"] <= 1
    assert item["risk_level"] in {"low", "medium", "high"}
    assert "artifact_path" not in response.text
    assert client.get("/api/predictions").status_code == 200


def test_prediction_rejects_missing_required_features(client, trained_model):
    record = _prediction_record()
    del record["weight_kg"]
    response = client.post(
        "/api/predictions",
        json={"model_id": trained_model["id"], "records": [record]},
    )
    assert response.status_code == 422
    assert "weight_kg" in response.json()["detail"]


def test_batch_predictions(client, trained_model):
    response = client.post(
        "/api/predictions/batch",
        json=[{
            "model_id": trained_model["id"],
            "records": [_prediction_record("B1")],
        }],
    )
    assert response.status_code == 200
    assert response.json()["count"] == 1


def test_analysis_and_report_endpoints(client):
    rows = [{
        "shipment_id": "A1",
        "carrier": "UPS",
        "origin_warehouse": "W1",
        "destination": "NYC",
        "created_at": "2024-01-01",
        "promised_delivery_date": "2024-01-05",
        "actual_delivery_date": "2024-01-05",
    }, {
        "shipment_id": "A2",
        "carrier": "DHL",
        "origin_warehouse": "W2",
        "destination": "SEA",
        "created_at": "2024-01-02",
        "promised_delivery_date": "2024-01-06",
        "actual_delivery_date": "2024-01-08",
    }]
    upload = client.post("/api/datasets/upload", files=_csv_file(rows))
    dataset_id = upload.json()["id"]
    response = client.post(f"/api/datasets/{dataset_id}/analyze")
    assert response.status_code == 200, response.text
    assert response.json()["summary"]["late_shipments"] == 1
    latest = client.get(f"/api/datasets/{dataset_id}/analysis")
    assert latest.status_code == 200
    assert latest.json()["summary"]["late_shipments"] == 1
    report_id = response.json()["report_id"]
    assert client.get(f"/api/reports/{report_id}").status_code == 200
    assert client.get(f"/api/reports/{report_id}/download").status_code == 200


def test_error_handling_for_missing_dataset(client):
    response = client.get("/api/datasets/nope")
    assert response.status_code == 404


def test_training_rejects_missing_target():
    with pytest.raises(ValueError, match="does not define a valid delay target"):
        ModelTrainingService.train(pd.DataFrame({"carrier": ["UPS"] * 25}))
