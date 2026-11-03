from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.services.auth import TenantContext, get_tenant_context


def current_tenant(
    request: Request,
    db: Session = Depends(get_db),
) -> TenantContext:
    return get_tenant_context(request, db)
