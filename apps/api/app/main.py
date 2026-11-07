"""Arpegia FastAPI Gateway Entrypoint.

Exposes REST endpoints for audio management, analysis orchestration,
and guitar intelligence pipelines.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any

app = FastAPI(
    title="Arpegia API",
    description="Backend REST API for Arpegia AI-Powered Guitar Intelligence Platform",
    version="0.1.0",
)

# Cross-Origin Resource Sharing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check() -> HealthResponse:
    """System health check endpoint."""
    return HealthResponse(
        status="ok",
        service="arpegia-api",
        version="0.1.0",
    )


@app.get("/", tags=["Root"])
async def root() -> Dict[str, Any]:
    """Root metadata endpoint."""
    return {
        "name": "Arpegia API",
        "version": "0.1.0",
        "docs_url": "/docs",
        "health_url": "/health",
    }
