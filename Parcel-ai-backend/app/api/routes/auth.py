from __future__ import annotations

import logging
import re
import smtplib
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.db.models import (
    AuthSession,
    EmailActionToken,
    LoginAttempt,
    Organization,
    OrganizationInvitation,
    OrganizationMembership,
    User,
    Workspace,
)
from app.schemas.auth import (
    ChangePasswordRequest,
    EmailTokenRequest,
    ForgotPasswordRequest,
    InvitationCreateRequest,
    LoginRequest,
    MembershipRoleUpdateRequest,
    OrganizationCreateRequest,
    ProfileUpdateRequest,
    RegisterRequest,
    ResetPasswordRequest,
    WorkspaceCreateRequest,
)
from app.services.auth import (
    SESSION_COOKIE,
    TenantContext,
    clear_session_cookies,
    create_email_action,
    create_invitation_token,
    create_organization_for_user,
    create_session,
    deliver_email,
    email_action_link,
    get_tenant_context,
    hash_password,
    require_permission,
    set_session_cookies,
    token_digest,
    utcnow,
    verify_password,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _organization_slug(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "workspace"
    return f"{base[:42]}-{uuid.uuid4().hex[:8]}"


def _email_status(user_email: str, purpose: str, token: str, subject: str) -> str:
    if not (settings.smtp_host and settings.smtp_from_email):
        return "not_configured"
    try:
        deliver_email(
            user_email,
            subject,
            f"Use this one-time link to continue. It expires automatically:\n\n"
            f"{email_action_link(purpose, token)}\n\n"
            "If you did not request this, you can ignore this message.",
        )
        return "sent"
    except (OSError, RuntimeError, smtplib.SMTPException) as exc:
        logger.warning("Email delivery failed for configured action: %s", type(exc).__name__)
        return "failed"


def _login_throttle_key(email: str, client_ip: str) -> str:
    return token_digest(f"{email.casefold()}|{client_ip}")


def _check_login_limit(db: Session, email: str, client_ip: str) -> str:
    row = db.query(LoginAttempt).filter(
        LoginAttempt.throttle_key == _login_throttle_key(email, client_ip)
    ).first()
    now = utcnow()
    if row and row.locked_until and row.locked_until > now:
        raise HTTPException(status_code=429, detail="Too many sign-in attempts. Try again later.")
    if row and row.window_started_at + timedelta(minutes=settings.login_window_minutes) <= now:
        db.delete(row)
        db.commit()
    return _login_throttle_key(email, client_ip)


def _record_login_failure(db: Session, throttle_key: str) -> None:
    now = utcnow()
    row = db.query(LoginAttempt).filter(LoginAttempt.throttle_key == throttle_key).first()
    if not row or row.window_started_at + timedelta(minutes=settings.login_window_minutes) <= now:
        if row:
            db.delete(row)
        row = LoginAttempt(
            throttle_key=throttle_key,
            attempts=0,
            window_started_at=now,
        )
        db.add(row)
    row.attempts += 1
    if row.attempts >= settings.login_max_attempts:
        row.locked_until = now + timedelta(minutes=settings.login_window_minutes)
    db.commit()


def _organization_summary(db: Session, user_id: str) -> list[dict]:
    user = db.query(User).filter(User.id == user_id).first()
    if user and user.is_platform_admin:
        organizations = db.query(Organization).order_by(Organization.created_at.asc()).all()
        return [
            {"id": organization.id, "name": organization.name, "slug": organization.slug, "role": "platform_super_admin"}
            for organization in organizations
        ]
    memberships = (
        db.query(OrganizationMembership, Organization)
        .join(Organization, Organization.id == OrganizationMembership.organization_id)
        .filter(OrganizationMembership.user_id == user_id)
        .order_by(Organization.created_at.asc())
        .all()
    )
    return [
        {
            "id": organization.id,
            "name": organization.name,
            "slug": organization.slug,
            "role": "platform_super_admin" if user and user.is_platform_admin else membership.role,
        }
        for membership, organization in memberships
    ]


def _user_summary(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "email_verified": bool(user.email_verified_at),
        "is_platform_admin": user.is_platform_admin,
    }


def _context(
    request: Request,
    db: Session = Depends(get_db),
) -> TenantContext:
    return get_tenant_context(request, db)


@router.post("/auth/register", status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User.id).filter(User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    admin_emails = {
        value.strip().lower()
        for value in settings.platform_super_admin_emails.split(",")
        if value.strip()
    }
    user = User(
        id=str(uuid.uuid4()),
        email=payload.email,
        display_name=payload.display_name,
        password_hash=hash_password(payload.password),
        is_platform_admin=payload.email in admin_emails,
    )
    db.add(user)
    organization = create_organization_for_user(
        db, user, payload.organization_name, _organization_slug(payload.organization_name)
    )
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="An account or organization could not be created") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not register account")
        raise HTTPException(status_code=503, detail="Account registration could not be completed") from exc

    action, raw_token = create_email_action(db, user, "verify_email")
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not create email verification action")
        raise HTTPException(status_code=503, detail="Email verification could not be initialized") from exc
    delivery = _email_status(
        user.email,
        "verify_email",
        raw_token,
        "Verify your PARCEL-AI email",
    )
    return {
        "user": _user_summary(user),
        "organization": {
            "id": organization.id,
            "name": organization.name,
            "role": "owner",
        },
        "email_verification_required": True,
        "email_delivery": delivery,
    }


@router.post("/auth/verify-email")
def verify_email(payload: EmailTokenRequest, db: Session = Depends(get_db)):
    action = (
        db.query(EmailActionToken)
        .filter(
            EmailActionToken.token_hash == token_digest(payload.token),
            EmailActionToken.purpose == "verify_email",
            EmailActionToken.used_at.is_(None),
            EmailActionToken.expires_at > utcnow(),
        )
        .first()
    )
    if not action:
        raise HTTPException(status_code=400, detail="Verification link is invalid or expired")
    user = db.query(User).filter(User.id == action.user_id, User.is_active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=400, detail="Verification link is invalid or expired")
    action.used_at = utcnow()
    user.email_verified_at = utcnow()
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not verify account email")
        raise HTTPException(status_code=503, detail="Email verification could not be saved") from exc
    return {"verified": True, "message": "Email verified. You can now sign in."}


@router.post("/auth/resend-verification", status_code=202)
def resend_verification(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email, User.is_active.is_(True)).first()
    if user and not user.email_verified_at:
        action, token = create_email_action(db, user, "verify_email")
        db.commit()
        _email_status(user.email, "verify_email", token, "Verify your PARCEL-AI email")
    return {"message": "If the account needs verification, instructions will be sent when email delivery is configured."}


@router.post("/auth/login")
def login(
    request: Request,
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else "unknown"
    throttle_key = _check_login_limit(db, payload.email, client_ip)
    user = db.query(User).filter(User.email == payload.email, User.is_active.is_(True)).first()
    if not user or not verify_password(payload.password, user.password_hash):
        _record_login_failure(db, throttle_key)
        raise HTTPException(status_code=401, detail="Email or password is incorrect")
    if not user.email_verified_at:
        raise HTTPException(status_code=403, detail="Verify your email before signing in")
    session, raw_token = create_session(db, user)
    attempt = db.query(LoginAttempt).filter(LoginAttempt.throttle_key == throttle_key).first()
    if attempt:
        db.delete(attempt)
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not create authenticated session")
        raise HTTPException(status_code=503, detail="Sign-in could not be completed") from exc
    set_session_cookies(response, raw_token)
    return {
        "user": _user_summary(user),
        "organizations": _organization_summary(db, user.id),
        "expires_at": session.expires_at.isoformat(),
    }


@router.post("/auth/logout")
def logout(
    request: Request,
    response: Response,
    context: TenantContext = Depends(_context),
    db: Session = Depends(get_db),
):
    raw_token = request.cookies.get(SESSION_COOKIE)
    session = db.query(AuthSession).filter(
        AuthSession.token_hash == token_digest(raw_token or ""),
        AuthSession.user_id == context.user_id,
        AuthSession.revoked_at.is_(None),
    ).first()
    if session:
        session.revoked_at = utcnow()
        db.commit()
    clear_session_cookies(response)
    return {"logged_out": True}


@router.get("/auth/me")
def read_me(
    context: TenantContext = Depends(_context),
    db: Session = Depends(get_db),
):
    return {
        "user": _user_summary(context.user),
        "organizations": _organization_summary(db, context.user_id),
        "active_organization_id": context.organization_id,
        "role": context.role,
    }


@router.patch("/auth/me")
def update_profile(
    payload: ProfileUpdateRequest,
    context: TenantContext = Depends(_context),
    db: Session = Depends(get_db),
):
    context.user.display_name = payload.display_name
    db.commit()
    return {"user": _user_summary(context.user)}


@router.post("/auth/change-password")
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    response: Response,
    context: TenantContext = Depends(_context),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, context.user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=422, detail="Choose a new password different from the current password")
    context.user.password_hash = hash_password(payload.new_password)
    db.query(AuthSession).filter(
        AuthSession.user_id == context.user_id,
        AuthSession.revoked_at.is_(None),
    ).update({"revoked_at": utcnow()}, synchronize_session=False)
    db.commit()
    clear_session_cookies(response)
    return {"password_changed": True, "message": "Password changed. Sign in again to continue."}


@router.post("/auth/forgot-password", status_code=202)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email, User.is_active.is_(True)).first()
    if user and user.email_verified_at:
        _, token = create_email_action(db, user, "reset_password")
        db.commit()
        _email_status(user.email, "reset_password", token, "Reset your PARCEL-AI password")
    return {"message": "If an eligible account exists, password reset instructions will be sent when email delivery is configured."}


@router.post("/auth/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    action = db.query(EmailActionToken).filter(
        EmailActionToken.token_hash == token_digest(payload.token),
        EmailActionToken.purpose == "reset_password",
        EmailActionToken.used_at.is_(None),
        EmailActionToken.expires_at > utcnow(),
    ).first()
    if not action:
        raise HTTPException(status_code=400, detail="Password reset link is invalid or expired")
    user = db.query(User).filter(User.id == action.user_id, User.is_active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=400, detail="Password reset link is invalid or expired")
    action.used_at = utcnow()
    user.password_hash = hash_password(payload.new_password)
    db.query(AuthSession).filter(
        AuthSession.user_id == user.id,
        AuthSession.revoked_at.is_(None),
    ).update({"revoked_at": utcnow()}, synchronize_session=False)
    db.commit()
    return {"password_reset": True, "message": "Password reset. Sign in with your new password."}


@router.get("/organizations")
def list_organizations(
    context: TenantContext = Depends(_context),
    db: Session = Depends(get_db),
):
    return {"items": _organization_summary(db, context.user_id)}


@router.post("/organizations", status_code=201)
def create_organization(
    payload: OrganizationCreateRequest,
    context: TenantContext = Depends(_context),
    db: Session = Depends(get_db),
):
    organization = create_organization_for_user(
        db, context.user, payload.name, _organization_slug(payload.name)
    )
    db.commit()
    return {
        "id": organization.id,
        "name": organization.name,
        "slug": organization.slug,
        "role": "owner",
    }


@router.get("/organizations/{organization_id}/members")
def list_members(
    organization_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    context = _context(request, db)
    if context.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Organization not found")
    require_permission(context, "read")
    members = (
        db.query(OrganizationMembership, User)
        .join(User, User.id == OrganizationMembership.user_id)
        .filter(OrganizationMembership.organization_id == organization_id)
        .order_by(OrganizationMembership.created_at.asc())
        .all()
    )
    return {"items": [
        {
            "id": membership.id,
            "user_id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "role": membership.role,
            "created_at": membership.created_at.isoformat(),
        }
        for membership, user in members
    ]}


@router.post("/organizations/{organization_id}/invitations", status_code=201)
def invite_member(
    organization_id: str,
    payload: InvitationCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    context = _context(request, db)
    if context.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Organization not found")
    if context.role == "manager":
        require_permission(context, "invite_limited")
        if payload.role not in {"analyst", "viewer"}:
            raise HTTPException(status_code=403, detail="Managers may invite analysts or viewers only")
    else:
        require_permission(context, "manage_members")
    if db.query(OrganizationMembership.id).join(
        User, User.id == OrganizationMembership.user_id
    ).filter(
        OrganizationMembership.organization_id == organization_id,
        User.email == payload.email,
    ).first():
        raise HTTPException(status_code=409, detail="This user is already a member")
    if db.query(OrganizationInvitation.id).filter(
        OrganizationInvitation.organization_id == organization_id,
        OrganizationInvitation.email == payload.email,
        OrganizationInvitation.accepted_at.is_(None),
        OrganizationInvitation.revoked_at.is_(None),
        OrganizationInvitation.expires_at > utcnow(),
    ).first():
        raise HTTPException(status_code=409, detail="An active invitation already exists for this email")

    raw_token, digest = create_invitation_token()
    invitation = OrganizationInvitation(
        id=str(uuid.uuid4()),
        organization_id=organization_id,
        email=payload.email,
        role=payload.role,
        token_hash=digest,
        invited_by_user_id=context.user_id,
        expires_at=utcnow() + timedelta(days=settings.invitation_ttl_days),
    )
    db.add(invitation)
    db.commit()
    organization = context.organization
    delivery = "not_configured"
    if settings.smtp_host and settings.smtp_from_email:
        try:
            deliver_email(
                invitation.email,
                f"Invitation to join {organization.name} on PARCEL-AI",
                f"You were invited to join {organization.name} as {invitation.role}.\n\n"
                f"Create or sign in to your account, then accept this invitation:\n"
                f"{settings.app_base_url.rstrip('/')}/accept-invitation?token={raw_token}",
            )
            delivery = "sent"
        except (OSError, RuntimeError, smtplib.SMTPException) as exc:
            logger.warning("Invitation email delivery failed: %s", type(exc).__name__)
            delivery = "failed"
    return {
        "id": invitation.id,
        "email": invitation.email,
        "role": invitation.role,
        "expires_at": invitation.expires_at.isoformat(),
        "delivery_status": delivery,
    }


@router.get("/organizations/{organization_id}/invitations")
def list_invitations(
    organization_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    context = _context(request, db)
    if context.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Organization not found")
    require_permission(context, "manage_members")
    rows = db.query(OrganizationInvitation).filter(
        OrganizationInvitation.organization_id == organization_id,
        OrganizationInvitation.accepted_at.is_(None),
        OrganizationInvitation.revoked_at.is_(None),
        OrganizationInvitation.expires_at > utcnow(),
    ).order_by(OrganizationInvitation.created_at.desc()).all()
    return {"items": [
        {"id": item.id, "email": item.email, "role": item.role, "expires_at": item.expires_at.isoformat()}
        for item in rows
    ]}


@router.post("/organizations/{organization_id}/invitations/{invitation_id}/revoke")
def revoke_invitation(
    organization_id: str,
    invitation_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    context = _context(request, db)
    if context.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Organization not found")
    require_permission(context, "manage_members")
    invitation = db.query(OrganizationInvitation).filter(
        OrganizationInvitation.id == invitation_id,
        OrganizationInvitation.organization_id == organization_id,
        OrganizationInvitation.accepted_at.is_(None),
        OrganizationInvitation.revoked_at.is_(None),
    ).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    invitation.revoked_at = utcnow()
    db.commit()
    return {"revoked": True, "invitation_id": invitation_id}


@router.post("/organizations/invitations/accept")
def accept_invitation(
    payload: EmailTokenRequest,
    context: TenantContext = Depends(_context),
    db: Session = Depends(get_db),
):
    invitation = db.query(OrganizationInvitation).filter(
        OrganizationInvitation.token_hash == token_digest(payload.token),
        OrganizationInvitation.accepted_at.is_(None),
        OrganizationInvitation.revoked_at.is_(None),
        OrganizationInvitation.expires_at > utcnow(),
    ).first()
    if not invitation or invitation.email != context.user.email:
        raise HTTPException(status_code=400, detail="Invitation is invalid, expired, or for another account")
    existing = db.query(OrganizationMembership.id).filter(
        OrganizationMembership.organization_id == invitation.organization_id,
        OrganizationMembership.user_id == context.user_id,
    ).first()
    if not existing:
        db.add(OrganizationMembership(
            id=str(uuid.uuid4()),
            organization_id=invitation.organization_id,
            user_id=context.user_id,
            role=invitation.role,
        ))
    invitation.accepted_at = utcnow()
    db.commit()
    return {"accepted": True, "organization_id": invitation.organization_id}


@router.patch("/organizations/{organization_id}/members/{membership_id}")
def update_member_role(
    organization_id: str,
    membership_id: str,
    payload: MembershipRoleUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    context = _context(request, db)
    if context.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Organization not found")
    require_permission(context, "manage_roles")
    membership = db.query(OrganizationMembership).filter(
        OrganizationMembership.id == membership_id,
        OrganizationMembership.organization_id == organization_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Member not found")
    if membership.role == "owner":
        raise HTTPException(status_code=409, detail="Organization owner role cannot be changed through this endpoint")
    if context.role != "owner" and payload.role in {"admin"}:
        raise HTTPException(status_code=403, detail="Only the organization owner may assign the admin role")
    membership.role = payload.role
    db.commit()
    return {"membership_id": membership.id, "role": membership.role}


@router.delete("/organizations/{organization_id}/members/{membership_id}")
def remove_member(
    organization_id: str,
    membership_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    context = _context(request, db)
    if context.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Organization not found")
    require_permission(context, "manage_members")
    membership = db.query(OrganizationMembership).filter(
        OrganizationMembership.id == membership_id,
        OrganizationMembership.organization_id == organization_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Member not found")
    if membership.role == "owner":
        raise HTTPException(status_code=409, detail="Organization owner cannot be removed")
    db.delete(membership)
    db.commit()
    return {"removed": True, "membership_id": membership_id}


@router.get("/organizations/{organization_id}/workspaces")
def list_workspaces(
    organization_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    context = _context(request, db)
    if context.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Organization not found")
    require_permission(context, "read")
    workspaces = db.query(Workspace).filter(
        Workspace.organization_id == organization_id
    ).order_by(Workspace.created_at.asc()).all()
    return {"items": [
        {"id": item.id, "name": item.name, "organization_id": item.organization_id}
        for item in workspaces
    ]}


@router.post("/organizations/{organization_id}/workspaces", status_code=201)
def create_workspace(
    organization_id: str,
    payload: WorkspaceCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    context = _context(request, db)
    if context.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Organization not found")
    require_permission(context, "manage_org")
    workspace = Workspace(
        id=str(uuid.uuid4()),
        organization_id=organization_id,
        name=payload.name,
    )
    db.add(workspace)
    db.commit()
    return {"id": workspace.id, "name": workspace.name, "organization_id": organization_id}
