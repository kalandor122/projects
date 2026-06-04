import os
from typing import Any

import httpx


class APIClient:
    def __init__(self, base_url: str | None = None) -> None:
        self._base = (base_url or os.getenv("API_BASE_URL", "http://localhost:3001")).rstrip("/")
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(30.0))

    async def close(self) -> None:
        await self._client.aclose()

    def _url(self, path: str) -> str:
        return f"{self._base}/api{path}"

    async def get(self, path: str) -> Any:
        resp = await self._client.get(self._url(path))
        resp.raise_for_status()
        return resp.json()

    async def post(self, path: str, body: dict[str, Any] | None = None) -> Any:
        resp = await self._client.post(self._url(path), json=body or {})
        resp.raise_for_status()
        return resp.json()

    async def patch(self, path: str, body: dict[str, Any]) -> Any:
        resp = await self._client.patch(self._url(path), json=body)
        resp.raise_for_status()
        return resp.json()

    async def delete(self, path: str) -> Any:
        resp = await self._client.delete(self._url(path))
        resp.raise_for_status()
        return resp.json()
