"""
Wayback Machine CDX API utilities.

Responsibilities:
  - Enumerate archived snapshots for a given URL pattern
  - Select the best snapshot for a given target date (closest before)
  - Fetch archived HTML with retry/backoff

CDX API reference: https://github.com/internetarchive/wayback/tree/master/wayback-cdx-server
"""

import time
import requests
from datetime import datetime, timedelta
from typing import Optional

CDX_ENDPOINT = "http://web.archive.org/cdx/search/cdx"
WBM_BASE = "https://web.archive.org/web"

# Oscar ceremony dates (day of ceremony) — used to find the best pre-ceremony snapshot.
# We target a snapshot taken within the 3 days prior to each ceremony.
CEREMONY_DATES = {
    91: "20190224",  # 2019
    92: "20200209",  # 2020
    93: "20210425",  # 2021 (COVID-delayed)
    94: "20220327",  # 2022
    95: "20230312",  # 2023
    96: "20240310",  # 2024
    97: "20250302",  # 2025
    98: "20260315",  # 2026
}


def cdx_snapshots(url_pattern: str, from_date: str = "20190101", to_date: str = "20260401",
                  status_filter: str = "200") -> list[dict]:
    """
    Return all archived snapshots matching url_pattern between from_date and to_date.

    Each returned dict has keys: timestamp, original, statuscode, mimetype.
    Results are deduplicated by (timestamp, original).
    """
    params = {
        "url": url_pattern,
        "output": "json",
        "from": from_date,
        "to": to_date,
        "fl": "timestamp,original,statuscode,mimetype",
        "filter": [f"statuscode:{status_filter}", "mimetype:text/html"],
        "limit": 2000,
    }
    resp = _get_with_retry(CDX_ENDPOINT, params=params)
    rows = resp.json()
    if not rows:
        return []
    headers = rows[0]
    return [dict(zip(headers, row)) for row in rows[1:]]


def best_snapshot_before(snapshots: list[dict], target_date: str,
                          max_days_before: int = 7) -> Optional[dict]:
    """
    From a list of CDX snapshot dicts, return the snapshot with the timestamp
    closest to (but not after) target_date.

    target_date: YYYYMMDD string
    Returns None if no snapshot falls within max_days_before days of target_date.
    """
    target = datetime.strptime(target_date, "%Y%m%d")
    cutoff = target - timedelta(days=max_days_before)

    candidates = []
    for snap in snapshots:
        ts = snap["timestamp"][:8]  # YYYYMMDD
        dt = datetime.strptime(ts, "%Y%m%d")
        if cutoff <= dt <= target:
            candidates.append((dt, snap))

    if not candidates:
        return None
    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0][1]


def fetch_snapshot(timestamp: str, original_url: str) -> str:
    """Fetch the HTML of an archived page. Returns the response text."""
    url = f"{WBM_BASE}/{timestamp}id_/{original_url}"
    resp = _get_with_retry(url, headers={"User-Agent": "OscarPredictionBot/1.0"})
    return resp.text


def snapshots_by_ceremony(url_pattern: str) -> dict[int, Optional[dict]]:
    """
    For a given Gold Derby URL pattern, return a dict mapping ceremony number
    to the best available pre-ceremony snapshot (or None if unavailable).
    """
    all_snaps = cdx_snapshots(url_pattern)
    result = {}
    for ceremony, date in CEREMONY_DATES.items():
        result[ceremony] = best_snapshot_before(all_snaps, date)
    return result


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_with_retry(url: str, params=None, headers=None,
                    max_retries: int = 5, base_delay: float = 2.0) -> requests.Response:
    """GET with exponential backoff. Raises on final failure."""
    last_exc = None
    for attempt in range(max_retries):
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=30)
            resp.raise_for_status()
            return resp
        except requests.RequestException as exc:
            last_exc = exc
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)
                print(f"  [retry {attempt+1}/{max_retries}] {exc} — waiting {delay:.0f}s")
                time.sleep(delay)
    raise RuntimeError(f"Failed after {max_retries} attempts: {last_exc}") from last_exc
