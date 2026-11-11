"""Guitar tuner presets API endpoints (Phase 5)."""

from typing import List
from fastapi import APIRouter, Query, status

from app.schemas.analysis import ErrorEnvelope, TuningPreset
from app.services.live_service import live_service

router = APIRouter(prefix="/tuner", tags=["Guitar Tuner & Pitch Intelligence"])


@router.get(
    "/presets",
    response_model=List[TuningPreset],
    status_code=status.HTTP_200_OK,
    responses={
        200: {"model": List[TuningPreset], "description": "List of 5 canonical guitar tuning presets"},
        422: {"model": ErrorEnvelope, "description": "Validation error on reference_a4_hz query param"},
    },
    summary="Retrieve guitar tuning presets and target frequencies (Phase 5)",
    description=(
        "Returns the 5 canonical guitar tuning presets (standard, drop_d, half_step_down, open_g, dadgad) "
        "with exact physical target frequencies and MIDI notes for all 6 strings."
    ),
)
async def get_tuning_presets(
    reference_a4_hz: float = Query(
        440.0,
        ge=415.0,
        le=466.0,
        description="Reference concert pitch frequency in Hz (default 440.0, range 415.0 to 466.0)",
    ),
) -> List[TuningPreset]:
    """Retrieve all 5 guitar tuning presets scaled to reference_a4_hz."""
    return live_service.get_tuning_presets(reference_a4_hz)
