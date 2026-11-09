"""Arpegia FastAPI Gateway Entrypoint.

Exposes REST endpoints for audio management, analysis orchestration,
and guitar intelligence pipelines on Port 8000.
"""

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import json
from typing import Any, AsyncGenerator, Dict
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.api.v1 import api_v1_router
from app.core.config import settings
from app.services.analyzer_service import analyzer_service


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    """Store the running event loop for threadsafe subscriber broadcasting."""
    analyzer_service.set_loop(asyncio.get_running_loop())
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Backend REST API for Arpegia AI-Powered Guitar Intelligence Platform",
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
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


async def _handle_websocket_stream(websocket: WebSocket, job_id: str) -> None:
    """Stream real-time JobProgressEvent frames over WebSocket and close cleanly on completion."""
    await websocket.accept()

    if not analyzer_service.has_job_or_progress(job_id):
        error_frame = {
            "event": "job.failed",
            "job_id": job_id,
            "status": "failed",
            "current_stage": "failed",
            "overall_percent": 0,
            "message": f"Analysis job '{job_id}' not found.",
            "steps": [],
            "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "result": None,
            "error": {
                "code": "JOB_NOT_FOUND",
                "message": f"Analysis job '{job_id}' not found.",
                "details": {"job_id": job_id},
            },
        }
        await websocket.send_text(json.dumps(error_frame))
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    queue: asyncio.Queue = asyncio.Queue()
    analyzer_service.subscribe_progress(job_id, queue)

    try:
        current_snapshot = analyzer_service.get_progress(job_id)
        if current_snapshot:
            await websocket.send_text(current_snapshot.model_dump_json())
            if (
                current_snapshot.event in ("job.completed", "job.failed")
                or current_snapshot.status in ("completed", "failed")
            ):
                await websocket.close(code=status.WS_1000_NORMAL_CLOSURE)
                return

        while True:
            event = await queue.get()
            await websocket.send_text(event.model_dump_json())
            if (
                event.event in ("job.completed", "job.failed")
                or event.status in ("completed", "failed")
            ):
                await websocket.close(code=status.WS_1000_NORMAL_CLOSURE)
                break
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        except Exception:
            pass
    finally:
        analyzer_service.unsubscribe_progress(job_id, queue)


@app.websocket("/ws/analyze/{job_id}")
async def websocket_analyze_progress(websocket: WebSocket, job_id: str) -> None:
    """Canonical WebSocket endpoint on Port 8000 (ws://localhost:8000/ws/analyze/{job_id})."""
    await _handle_websocket_stream(websocket, job_id)


@app.websocket(f"{settings.API_V1_STR}/ws/analyze/{{job_id}}")
async def websocket_analyze_progress_v1_alias(websocket: WebSocket, job_id: str) -> None:
    """API v1 alias WebSocket endpoint (ws://localhost:8000/api/v1/ws/analyze/{job_id})."""
    await _handle_websocket_stream(websocket, job_id)
