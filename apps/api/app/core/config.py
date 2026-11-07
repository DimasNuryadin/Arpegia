"""Application configuration and environment settings."""

from typing import List, Set
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration settings for Arpegia API."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # API Metadata
    PROJECT_NAME: str = "Arpegia API"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = False

    # CORS Configuration
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # Audio Upload Constraints (Phase 1 MVP: Max 25MB, MP3/WAV)
    MAX_UPLOAD_SIZE_BYTES: int = 25 * 1024 * 1024  # 25 Megabytes
    ALLOWED_AUDIO_EXTENSIONS: Set[str] = {".mp3", ".wav"}
    ALLOWED_AUDIO_MIME_TYPES: Set[str] = {
        "audio/mpeg",
        "audio/mp3",
        "audio/wav",
        "audio/x-wav",
        "audio/wave",
        "application/octet-stream",  # Fallback for some clients, guarded by extension check
    }

    # Audio Engine Service URL (if microservice communication is configured)
    AUDIO_ENGINE_URL: str = "http://localhost:8001"


settings = Settings()
