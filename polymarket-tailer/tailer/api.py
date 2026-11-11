"""Thin client for Polymarket's public read-only APIs.

Endpoints used (no auth required):
  Data API   https://data-api.polymarket.com/v2   leaderboard, positions, trades
  Gamma API  https://gamma-api.polymarket.com     market metadata and resolution
  CLOB API   https://clob.polymarket.com          order books and price history
"""

from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Iterable, Iterator

DATA = "https://data-api.polymarket.com/v2"
GAMMA = "https://gamma-api.polymarket.com"
CLOB = "https://clob.polymarket.com"

USER_AGENT = "polymarket-tailer/0.1 (research prototype)"


class ApiError(RuntimeError):
    pass


class Client:
    """HTTP client with retries, polite backoff and an optional on-disk cache."""

    def __init__(self, cache_dir: str | None = None, cache_ttl: int = 600, timeout: int = 20):
        self.cache_dir = Path(cache_dir) if cache_dir else None
        self.cache_ttl = cache_ttl
        self.timeout = timeout
        if self.cache_dir:
            self.cache_dir.mkdir(parents=True, exist_ok=True)

    # ---------------------------------------------------------------- core
    def get(self, base: str, path: str, params: dict | list | None = None, ttl: int | None = None) -> Any:
        query = urllib.parse.urlencode(params or {}, doseq=True)
        url = f"{base}{path}" + (f"?{query}" if query else "")
        ttl = self.cache_ttl if ttl is None else ttl

        cache_file = None
        if self.cache_dir and ttl > 0:
            cache_file = self.cache_dir / (hashlib.sha1(url.encode()).hexdigest() + ".json")
            if cache_file.exists() and time.time() - cache_file.stat().st_mtime < ttl:
                try:
                    return json.loads(cache_file.read_text())
                except (OSError, json.JSONDecodeError):
                    pass

        delay = 1.0
        for attempt in range(5):
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    data = json.loads(resp.read().decode())
                break
            except urllib.error.HTTPError as e:
                body = e.read().decode(errors="replace")[:300]
                if e.code in (429, 500, 502, 503, 504) and attempt < 4:
                    time.sleep(delay)
                    delay *= 2
                    continue
                raise ApiError(f"GET {url} -> HTTP {e.code}: {body}") from None
            except (urllib.error.URLError, TimeoutError) as e:
                if attempt < 4:
                    time.sleep(delay)
                    delay *= 2
                    continue
                raise ApiError(f"GET {url} failed: {e}") from None

        if isinstance(data, dict) and data.get("error"):
            raise ApiError(f"GET {url}: {data['error']}")
        if cache_file:
            try:
                cache_file.write_text(json.dumps(data))
            except OSError:
                pass
        return data

    def paginate(self, path: str, params: dict, max_items: int, page_size: int = 500, ttl: int | None = None) -> Iterator[dict]:
        """Walk a cursor-paginated Data API v2 endpoint."""
        params = dict(params)
        params["limit"] = min(page_size, max_items)
        seen = 0
        while seen < max_items:
            resp = self.get(DATA, path, params, ttl=ttl)
            rows = resp.get("data") or []
            for row in rows:
                yield row
                seen += 1
                if seen >= max_items:
                    return
            pag = resp.get("pagination") or {}
            if not pag.get("has_more") or not pag.get("next_cursor") or not rows:
                return
            params["cursor"] = pag["next_cursor"]

    # ----------------------------------------------------------- Data API
    def leaderboard(self, period: str = "MONTH", sort_by: str = "PNL", limit: int = 100, category: str | None = None) -> list[dict]:
        params = {"timePeriod": period, "sort_by": sort_by}
        if category:
            params["category"] = category
        return list(self.paginate("/leaderboard", params, max_items=limit, page_size=100))

    def positions(self, user: str, status: str = "OPEN", limit: int = 500, sort_by: str = "TIMESTAMP") -> list[dict]:
        params = {"user": user, "status": status, "sort_by": sort_by}
        return list(self.paginate("/positions", params, max_items=limit))

    def trades(self, user: str, start: int | None = None, end: int | None = None, side: str | None = None, limit: int = 2000) -> list[dict]:
        params: dict[str, Any] = {"user": user}
        if start:
            params["start"] = int(start)
        if end:
            params["end"] = int(end)
        if side:
            params["side"] = side
        return list(self.paginate("/trades", params, max_items=limit))

    # ---------------------------------------------------------- Gamma API
    def markets_by_condition(self, condition_ids: Iterable[str], closed: bool | None = None, batch: int = 25) -> dict[str, dict]:
        """Map condition_id -> Gamma market. Gamma hides closed markets unless closed=true is passed."""
        ids = sorted(set(condition_ids))
        out: dict[str, dict] = {}
        for i in range(0, len(ids), batch):
            chunk = ids[i : i + batch]
            params: list[tuple[str, str]] = [("condition_ids", c) for c in chunk]
            params.append(("limit", str(len(chunk))))
            if closed is not None:
                params.append(("closed", "true" if closed else "false"))
            for m in self.get(GAMMA, "/markets", params, ttl=3600) or []:
                cid = m.get("conditionId")
                if cid:
                    out[cid] = m
        return out

    # ----------------------------------------------------------- CLOB API
    def book(self, token_id: str) -> dict:
        return self.get(CLOB, "/book", {"token_id": token_id}, ttl=30)

    def price_history(self, token_id: str, start_ts: int, end_ts: int, fidelity: int = 1) -> list[dict]:
        resp = self.get(
            CLOB,
            "/prices-history",
            {"market": token_id, "startTs": int(start_ts), "endTs": int(end_ts), "fidelity": fidelity},
            ttl=86400,
        )
        return resp.get("history") or []


def default_client() -> Client:
    cache = os.environ.get("TAILER_CACHE_DIR", str(Path.home() / ".cache" / "polymarket-tailer"))
    return Client(cache_dir=cache)


def parse_json_list(value: Any) -> list:
    """Gamma returns some list fields as JSON-encoded strings."""
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []
