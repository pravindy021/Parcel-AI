from __future__ import annotations

from typing import Any, Awaitable, Callable

from starlette.responses import JSONResponse

from app.core.config import settings

ASGIMessage = dict[str, Any]
ASGIReceive = Callable[[], Awaitable[ASGIMessage]]
ASGISend = Callable[[ASGIMessage], Awaitable[None]]


class _RequestBodyTooLarge(Exception):
    pass


class UploadRequestLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: ASGIReceive, send: ASGISend) -> None:
        if scope["type"] != "http" or not scope.get("path", "").endswith("/datasets/upload"):
            await self.app(scope, receive, send)
            return

        max_request_bytes = settings.max_upload_size_mb * 1024 * 1024 + 1024 * 1024
        headers = dict(scope.get("headers", []))
        raw_length = headers.get(b"content-length")
        if raw_length:
            try:
                declared_length = int(raw_length)
            except ValueError:
                declared_length = None
            if declared_length is not None and declared_length > max_request_bytes:
                response = JSONResponse(
                    status_code=413,
                    content={"detail": f"Upload request exceeds the configured {settings.max_upload_size_mb} MB file limit"},
                )
                await response(scope, receive, send)
                return

        received_bytes = 0

        async def limited_receive() -> ASGIMessage:
            nonlocal received_bytes
            message = await receive()
            if message["type"] == "http.request":
                received_bytes += len(message.get("body", b""))
                if received_bytes > max_request_bytes:
                    raise _RequestBodyTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _RequestBodyTooLarge:
            response = JSONResponse(
                status_code=413,
                content={"detail": f"Upload request exceeds the configured {settings.max_upload_size_mb} MB file limit"},
            )
            await response(scope, receive, send)
