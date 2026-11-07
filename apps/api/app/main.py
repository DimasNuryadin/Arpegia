"""Arpegia FastAPI Gateway Entrypoint.

Exposes REST endpoints for audio management, analysis orchestration,
and guitar intelligence pipelines.
"""

from typing import Any, Dict
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
