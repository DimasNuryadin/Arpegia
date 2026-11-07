"""Pytest configuration and test client fixtures."""

import sys
from pathlib import Path
from typing import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient

# Ensure apps/api is included in sys.path
api_root = Path(__file__).parent.parent.resolve()
if str(api_root) not in sys.path:
    sys.path.insert(0, str(api_root))

from app.main import app  # noqa: E402


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Provide an asynchronous HTTP client hooked into the FastAPI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
