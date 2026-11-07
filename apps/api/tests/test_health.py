"""Tests for health and root discovery endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
async def test_health_check(client: AsyncClient) -> None:
    """Verify that the health check returns 200 and expected status format."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "arpegia-api"
    assert "version" in data


@pytest.mark.anyio
async def test_root_endpoint(client: AsyncClient) -> None:
    """Verify that the root endpoint returns API metadata."""
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Arpegia API"
    assert data["health_url"] == "/health"
    assert data["api_v1"] == "/api/v1"
