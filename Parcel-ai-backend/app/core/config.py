
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Parcel-AI"
    environment: str = "development"
    api_prefix: str = "/api"
    max_upload_size_mb: int = Field(default=20, gt=0)
    max_dataset_rows: int = Field(default=250_000, gt=0)
    max_dataset_columns: int = Field(default=200, gt=0)
    upload_dir: str = "data/uploads"
    database_url: str = "sqlite:///./parcel_ai.db"
    model_dir: str = "models"
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    risk_medium_threshold: float = Field(default=0.5, ge=0, le=1)
    risk_high_threshold: float = Field(default=0.75, ge=0, le=1)
    auth_session_ttl_hours: int = Field(default=12, ge=1, le=720)
    email_verification_ttl_hours: int = Field(default=24, ge=1, le=168)
    password_reset_ttl_minutes: int = Field(default=30, ge=5, le=120)
    invitation_ttl_days: int = Field(default=7, ge=1, le=30)
    auth_cookie_secure: bool = False
    auth_cookie_samesite: str = "lax"
    login_max_attempts: int = Field(default=5, ge=3, le=20)
    login_window_minutes: int = Field(default=15, ge=1, le=120)
    app_base_url: str = "http://localhost:5173"

    # Resend Email API
    resend_api_key: str = ""
    resend_from_email: str = ""

    # Legacy SMTP settings
    smtp_host: str = ""
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_starttls: bool = True

    platform_super_admin_emails: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        protected_namespaces=(),
    )

    @model_validator(mode="after")
    def validate_risk_thresholds(self):
        if self.risk_high_threshold < self.risk_medium_threshold:
            raise ValueError(
                "RISK_HIGH_THRESHOLD must be greater than or equal to RISK_MEDIUM_THRESHOLD"
            )

        if self.environment.lower() == "production" and not self.auth_cookie_secure:
            raise ValueError("AUTH_COOKIE_SECURE must be true in production")

        if self.auth_cookie_samesite.lower() not in {"lax", "strict", "none"}:
            raise ValueError("AUTH_COOKIE_SAMESITE must be lax, strict, or none")

        if self.auth_cookie_samesite.lower() == "none" and not self.auth_cookie_secure:
            raise ValueError(
                "AUTH_COOKIE_SECURE must be true when AUTH_COOKIE_SAMESITE is none"
            )

        return self


settings = Settings()