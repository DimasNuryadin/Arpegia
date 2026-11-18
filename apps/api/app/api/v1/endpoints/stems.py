"""Stem separation endpoints using Meta AI HTDemucs 6s."""

import os
import shutil
import tempfile
import uuid
from pathlib import Path
from fastapi import APIRouter, File, UploadFile, HTTPException, status
from fastapi.responses import FileResponse
from app.core.config import settings
from app.services.stem_service import stem_service

router = APIRouter(prefix="/stems", tags=["Stem Separation"])

UPLOAD_DIR = Path(tempfile.gettempdir()) / "arpegia_uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/separate")
async def separate_audio(
    file: UploadFile = File(...),
):
    """Upload an audio file and separate it into 6 isolated neural stems via HTDemucs 6s."""
    file_ext = Path(file.filename or "").suffix.lower()
    if file_ext not in settings.ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported format '{file_ext}'. Allowed: {', '.join(settings.ALLOWED_AUDIO_EXTENSIONS)}",
        )

    job_id = str(uuid.uuid4())[:8]
    temp_path = UPLOAD_DIR / f"{job_id}{file_ext}"

    try:
        # Save uploaded file
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Run separation
        result = stem_service.separate_track(temp_path, job_id=job_id)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stem separation failed: {str(e)}",
        )
    finally:
        # Clean up temp upload file
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass


@router.get("/download/{job_id}/{filename}")
async def download_stem(job_id: str, filename: str):
    """Stream or download an isolated stem WAV file."""
    file_path = stem_service.storage_dir / job_id / filename
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stem file '{filename}' for job '{job_id}' not found.",
        )

    return FileResponse(
        path=file_path,
        media_type="audio/wav",
        filename=filename,
    )
