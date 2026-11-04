from __future__ import annotations

import hashlib
import hmac
import httpx
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Request, Response
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.models import (
    AuthSession,
    EmailActionToken,
    Organization,
    OrganizationMembership,
    User,
    Workspace,
)

PASSWORD_ITERATIONS = 310_000
SESSION_COOKIE = "parcel_ai_session"
CSRF_COOKIE = "parcel_ai_csrf"
ROLE_NAMES = {"owner", "admin", "manager", "analyst", "viewer"}
ROLE_PERMISSIONS = {
    "owner": {"read", "write", "manage_members", "manage_roles", "manage_org"},
    "admin": {"read", "write", "manage_members", "manage_roles", "manage_org"},
    "manager": {"read", "write", "invite_limited"},
    "analyst": {"read", "write"},
    "viewer": {"read"},
    "platform_super_admin": {"read", "write", "manage_members", "manage_roles", "manage_org"},
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS
    )
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${salt.hex()}${derived.hex()}"


def verify_password(password: str, encoded_hash: str) -> bool:
    try:
        algorithm, iteration_text, salt_hex, digest_hex = encoded_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iteration_text)
        if iterations < 100_000 or iterations > 2_000_000:
            return False
        expected = bytes.fromhex(digest_hex)
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), iterations
        )
        return hmac.compare_digest(candidate, expected)
    except (ValueError, TypeError):
        return False


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(db: Session, user: User) -> tuple[AuthSession, str]:
    token = secrets.token_urlsafe(48)
    session = AuthSession(
        id=str(uuid.uuid4()),
        user_id=user.id,
        token_hash=token_digest(token),
        expires_at=utcnow() + timedelta(hours=settings.auth_session_ttl_hours),
    )
    db.add(session)
    return session, token


def set_session_cookies(response: Response, session_token: str) -> str:
    csrf_token = secrets.token_urlsafe(32)
    max_age = settings.auth_session_ttl_hours * 3600
    common = {
        "secure": settings.auth_cookie_secure,
        "samesite": settings.auth_cookie_samesite.lower(),
        "path": "/",
        "max_age": max_age,
    }
    response.set_cookie(
        SESSION_COOKIE,
        session_token,
        httponly=True,
        **common,
    )
    response.set_cookie(CSRF_COOKIE, csrf_token, httponly=False, **common)
    return csrf_token


def clear_session_cookies(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/", secure=settings.auth_cookie_secure, httponly=True, samesite=settings.auth_cookie_samesite.lower())
    response.delete_cookie(CSRF_COOKIE, path="/", secure=settings.auth_cookie_secure, httponly=False, samesite=settings.auth_cookie_samesite.lower())


def create_email_action(db: Session, user: User, purpose: str) -> tuple[EmailActionToken, str]:
    token = secrets.token_urlsafe(40)
    if purpose == "verify_email":
        expires = timedelta(hours=settings.email_verification_ttl_hours)
    else:
        expires = timedelta(minutes=settings.password_reset_ttl_minutes)
    db.query(EmailActionToken).filter(
        EmailActionToken.user_id == user.id,
        EmailActionToken.purpose == purpose,
        EmailActionToken.used_at.is_(None),
    ).update({"used_at": utcnow()}, synchronize_session=False)
    action = EmailActionToken(
        id=str(uuid.uuid4()),
        user_id=user.id,
        purpose=purpose,
        token_hash=token_digest(token),
        expires_at=utcnow() + expires,
    )
    db.add(action)
    return action, token


def create_invitation_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(40)
    return token, token_digest(token)


def deliver_email(recipient: str, subject: str, body: str) -> None:
    """
    Send an email using the Resend API.
    """

    if not settings.resend_api_key or not settings.resend_from_email:
        raise RuntimeError("Resend email delivery is not configured")

    payload = {
        "from": settings.resend_from_email,
        "to": [recipient],
        "subject": subject,
        "text": body,
    }

    headers = {
        "Authorization": f"Bearer {settings.resend_api_key}",
        "Content-Type": "application/json",
    }

    try:
        response = httpx.post(
            "https://api.resend.com/emails",
            json=payload,
            headers=headers,
            timeout=20.0,
        )

        if not response.is_success:
            raise RuntimeError(
                f"Resend API returned HTTP {response.status_code}: "
                f"{response.text[:500]}"
            )

    except httpx.HTTPError as exc:
        raise RuntimeError(
            f"Resend email request failed: {type(exc).__name__}"
        ) from exc


def email_action_link(purpose: str, token: str) -> str:
    route = "verify-email" if purpose == "verify_email" else "reset-password"
    return f"{settings.app_base_url.rstrip('/')}/{route}?token={token}"


@dataclass(frozen=True)
class TenantContext:
    user: User
    organization: Organization
    role: str

    @property
    def organization_id(self) -> str:
        return self.organization.id

    @property
    def user_id(self) -> str:
        return self.user.id


def get_tenant_context(request: Request, db: Session) -> TenantContext:
    raw_token = request.cookies.get(SESSION_COOKIE)
    if not raw_token:
        raise HTTPException(status_code=401, detail="Authentication is required")
    session = (
        db.query(AuthSession)
        .filter(
            AuthSession.token_hash == token_digest(raw_token),
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > utcnow(),
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=401, detail="Session is invalid or expired")
    user = db.query(User).filter(User.id == session.user_id, User.is_active.is_(True)).first()
    if not user or not user.email_verified_at:
        raise HTTPException(status_code=401, detail="Authentication is required")

    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        csrf_cookie = request.cookies.get(CSRF_COOKIE)
        csrf_header = request.headers.get("X-CSRF-Token")
        if not csrf_cookie or not csrf_header or not hmac.compare_digest(csrf_cookie, csrf_header):
            raise HTTPException(status_code=403, detail="CSRF token is missing or invalid")

    origin = request.headers.get("Origin")
    if origin and origin not in {
        item.strip() for item in settings.allowed_origins.split(",") if item.strip()
    }:
        raise HTTPException(status_code=403, detail="Request origin is not allowed")

    requested_organization = request.headers.get("X-Organization-ID")
    if user.is_platform_admin and requested_organization:
        organization = db.query(Organization).filter(
            Organization.id == requested_organization
        ).first()
        if organization:
            return TenantContext(
                user=user,
                organization=organization,
                role="platform_super_admin",
            )
    memberships = db.query(OrganizationMembership).filter(
        OrganizationMembership.user_id == user.id
    )
    if requested_organization:
        memberships = memberships.filter(
            OrganizationMembership.organization_id == requested_organization
        )
    membership = memberships.order_by(OrganizationMembership.created_at.asc()).first()
    if not membership:
        raise HTTPException(status_code=403, detail="Organization access is not available")
    organization = (
        db.query(Organization).filter(Organization.id == membership.organization_id).first()
    )
    if not organization:
        raise HTTPException(status_code=403, detail="Organization access is not available")
    return TenantContext(user=user, organization=organization, role=membership.role)


def require_permission(context: TenantContext, permission: str) -> None:
    if permission not in ROLE_PERMISSIONS.get(context.role, set()):
        raise HTTPException(status_code=403, detail="You do not have permission to perform this action")


def create_organization_for_user(
    db: Session,
    user: User,
    name: str,
    slug: str,
) -> Organization:
    organization = Organization(
        id=str(uuid.uuid4()),
        name=name.strip(),
        slug=slug,
        created_by_user_id=user.id,
    )
    db.add(organization)
    db.flush()
    db.add(OrganizationMembership(
        id=str(uuid.uuid4()),
        organization_id=organization.id,
        user_id=user.id,
        role="owner",
    ))
    db.add(Workspace(
        id=str(uuid.uuid4()),
        organization_id=organization.id,
        name=f"{name.strip()} workspace",
    ))
    return organization
