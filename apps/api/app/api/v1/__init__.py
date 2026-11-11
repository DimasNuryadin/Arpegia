"""API version 1 router definition."""

from fastapi import APIRouter
from app.api.v1.endpoints import analyze, live, tuner

api_v1_router = APIRouter()
api_v1_router.include_router(analyze.router)
api_v1_router.include_router(tuner.router)
api_v1_router.include_router(live.router)

__all__ = ["api_v1_router"]

