# Arpegia Infrastructure & Docker

Contains Dockerfiles and container configurations for local development and deployment.

## Images
- `Dockerfile.web`: Multi-stage build for Next.js frontend (`apps/web`).
- `Dockerfile.api`: Python 3.11 environment for FastAPI gateway (`apps/api`).
- `Dockerfile.audio-engine`: Python 3.11 environment with `ffmpeg` and `libsndfile` for Audio DSP (`services/audio-engine`).
