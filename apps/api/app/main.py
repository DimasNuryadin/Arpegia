"""Arpegia FastAPI Gateway Entrypoint.

Exposes REST endpoints for audio management, analysis orchestration,
and guitar intelligence pipelines on Port 8000.
"""

from typing import Any, Dict
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.api.v1 import api_v1_router
from app.core.config import settings


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Backend REST API for Arpegia AI-Powered Guitar Intelligence Platform",
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)

# Cross-Origin Resource Sharing (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


def _resolve_error_code(status_code: int, message: str) -> str:
    """Map HTTP status code and message to canonical error codes from docs/api-contract.md."""
    msg_lower = message.lower()
    if status_code == status.HTTP_404_NOT_FOUND:
        if "arrangement" in msg_lower:
            return "ARRANGEMENT_NOT_FOUND"
        return "JOB_NOT_FOUND"
    if status_code == status.HTTP_413_CONTENT_TOO_LARGE:
        return "FILE_TOO_LARGE"
    if status_code == status.HTTP_400_BAD_REQUEST:
        if "export" in msg_lower:
            return "UNSUPPORTED_EXPORT_FORMAT"
        if "arrangement" in msg_lower or "style" in msg_lower or "tempo_scale" in msg_lower:
            return "INVALID_ARRANGEMENT_REQUEST"
        if "format" in msg_lower or "mime" in msg_lower or "filename" in msg_lower:
            return "INVALID_AUDIO_FORMAT"
        return "INVALID_TAB_NOTE"
    if status_code == status.HTTP_422_UNPROCESSABLE_ENTITY:
        return "VALIDATION_ERROR"
    return "INTERNAL_ERROR"


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    """Render HTTPExceptions using the standard ErrorEnvelope while preserving 'detail'."""
    if isinstance(exc.detail, dict):
        code = str(exc.detail.get("code", _resolve_error_code(exc.status_code, "")))
        message = str(exc.detail.get("message", "Request error."))
        details = exc.detail.get("details")
    else:
        message = str(exc.detail)
        code = _resolve_error_code(exc.status_code, message)
        details = None

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": message,
            "error": {
                "code": code,
                "message": message,
                "details": details,
            },
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Render Pydantic/FastAPI validation errors using the standard ErrorEnvelope."""
    errors = jsonable_encoder(exc.errors())
    summary_parts = []
    for err in errors:
        loc = ".".join(str(part) for part in err.get("loc", []) if part != "body")
        msg = err.get("msg", "Invalid value")
        summary_parts.append(f"{loc}: {msg}" if loc else msg)
    message = "; ".join(summary_parts) if summary_parts else "Validation error."

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": message,
            "error": {
                "code": "VALIDATION_ERROR",
                "message": message,
                "details": errors,
            },
        },
    )


class HealthResponse(BaseModel):
    """Health check response payload."""

    status: str
    service: str
    version: str


@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["System"],
    summary="System Health Check",
    description="Returns the operational status and version of the Arpegia API gateway.",
)
async def health_check() -> HealthResponse:
    """System health check endpoint."""
    return HealthResponse(
        status="ok",
        service="arpegia-api",
        version=settings.VERSION,
    )


@app.get("/", tags=["Root"], summary="Root Metadata")
async def root() -> Dict[str, Any]:
    """Root metadata endpoint providing API entrypoints."""
    return {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs_url": "/docs",
        "health_url": "/health",
        "api_v1": settings.API_V1_STR,
    }


# Register Version 1 Routers
app.include_router(api_v1_router, prefix=settings.API_V1_STR)
