# Arpegia API

FastAPI backend gateway for Arpegia, providing REST endpoints, authentication, job orchestration, and database operations.

## Features
- Health check and monitoring endpoint (`/health`)
- OpenAPI documentation (`/docs`, `/redoc`)
- Async request processing and background task dispatching

## Quick Start (Local Development)

```bash
# 1. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start development server
uvicorn app.main:app --reload --port 8000
```
