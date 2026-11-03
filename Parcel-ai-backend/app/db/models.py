from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from app.db.base import Base


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, nullable=False, unique=True, index=True)
    display_name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    email_verified_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    is_platform_admin = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=_utcnow_naive)
    updated_at = Column(DateTime, nullable=False, default=_utcnow_naive, onupdate=_utcnow_naive)


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    slug = Column(String, nullable=False, unique=True, index=True)
    created_by_user_id = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=_utcnow_naive)


class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(String, primary_key=True)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=_utcnow_naive)


class OrganizationMembership(Base):
    __tablename__ = "organization_memberships"
    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_membership_organization_user"),
    )

    id = Column(String, primary_key=True)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String, nullable=False, default="viewer")
    created_at = Column(DateTime, nullable=False, default=_utcnow_naive)


class OrganizationInvitation(Base):
    __tablename__ = "organization_invitations"

    id = Column(String, primary_key=True)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False, index=True)
    email = Column(String, nullable=False, index=True)
    role = Column(String, nullable=False)
    token_hash = Column(String, nullable=False, unique=True)
    invited_by_user_id = Column(String, ForeignKey("users.id"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow_naive)


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String, nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow_naive)


class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    throttle_key = Column(String, primary_key=True)
    attempts = Column(Integer, nullable=False, default=0)
    window_started_at = Column(DateTime, nullable=False)
    locked_until = Column(DateTime, nullable=True)


class EmailActionToken(Base):
    __tablename__ = "email_action_tokens"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    purpose = Column(String, nullable=False)
    token_hash = Column(String, nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow_naive)


class UploadedDataset(Base):
    __tablename__ = "uploaded_datasets"

    id = Column(String, primary_key=True)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    owner_user_id = Column(String, ForeignKey("users.id"), nullable=True, index=True)
    filename = Column(String, nullable=False)
    stored_name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    status = Column(String, default="uploaded")
    description = Column(Text, default="")
    metadata_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=_utcnow_naive)
    updated_at = Column(DateTime, default=_utcnow_naive, onupdate=_utcnow_naive)


class DatasetValidationReport(Base):
    __tablename__ = "dataset_validation_reports"

    id = Column(String, primary_key=True)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    dataset_id = Column(String, ForeignKey("uploaded_datasets.id"), nullable=False)
    status = Column(String, default="pending")
    total_records = Column(Integer, default=0)
    valid_records = Column(Integer, default=0)
    invalid_records = Column(Integer, default=0)
    missing_values = Column(Integer, default=0)
    duplicate_records = Column(Integer, default=0)
    warnings = Column(JSON, default=list)
    errors = Column(JSON, default=list)
    column_stats = Column(JSON, default=dict)
    generated_at = Column(DateTime, default=_utcnow_naive)


class AnalysisReport(Base):
    __tablename__ = "analysis_reports"

    id = Column(String, primary_key=True)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    dataset_id = Column(String, ForeignKey("uploaded_datasets.id"), nullable=False)
    summary = Column(JSON, default=dict)
    chart_ready = Column(JSON, default=dict)
    generated_at = Column(DateTime, default=_utcnow_naive)


class ModelVersion(Base):
    __tablename__ = "model_versions"

    id = Column(String, primary_key=True)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    model_type = Column(String, nullable=False)
    version = Column(String, nullable=False)
    metrics_json = Column(JSON, default=dict)
    feature_columns = Column(JSON, default=list)
    artifact_path = Column(String, nullable=False)
    created_at = Column(DateTime, default=_utcnow_naive)


class PredictionRecord(Base):
    __tablename__ = "prediction_records"

    id = Column(String, primary_key=True)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    model_id = Column(String, ForeignKey("model_versions.id"), nullable=False)
    dataset_id = Column(String, ForeignKey("uploaded_datasets.id"), nullable=True)
    shipment_id = Column(String, nullable=True)
    probability = Column(String, nullable=False)
    risk_level = Column(String, nullable=False)
    prediction_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=_utcnow_naive)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(String, primary_key=True)
    event_type = Column(String, nullable=False)
    entity_type = Column(String, nullable=False)
    entity_id = Column(String, nullable=False)
    details_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=_utcnow_naive)
