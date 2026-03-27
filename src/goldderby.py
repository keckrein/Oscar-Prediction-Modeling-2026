"""
Gold Derby scraper.

Responsibilities:
  - Map Oscar categories to Gold Derby URL slugs
  - Enumerate available Wayback Machine snapshots for each category page
  - Parse Gold Derby odds HTML into a tidy DataFrame
  - Convert fractional odds to implied probabilities

Gold Derby odds format:
  - Fractional (e.g. "7/2") on nomination prediction pages
  - Percentage (e.g. "72%") on winner prediction pages
  - Separate predictor groups: Experts, Editors, Top24, All-Stars, Users, Combined

The canonical output of this module is a DataFrame with schema:
  ceremony   int       Oscar ceremony number (e.g. 96)
  year       int       Calendar year of ceremony (e.g. 2024)
  category   str       Standardized category slug (e.g. "best-picture")
  nominee    str       Film or person name as listed on Gold Derby
  group      str       Predictor group ("experts" | "editors" | "users" | "combined")
  probability float    Implied win probability in [0, 1]
  snapshot_ts str      Wayback Machine timestamp of the source snapshot
  snapshot_url str     Original URL of the archived page
"""

import re
from typing import Optional

import pandas as pd
from bs4 import BeautifulSoup

from src.wayback import cdx_snapshots, best_snapshot_before, fetch_snapshot, CEREMONY_DATES

# ---------------------------------------------------------------------------
# Category map: Gold Derby URL slug → standardized category name
# ---------------------------------------------------------------------------
# Confirmed slugs from Gold Derby's /odds/oscar-odds/<slug>/ structure.
# Pre-2022 may use slightly different slugs; fallbacks noted in comments.
CATEGORY_SLUGS = {
    "best-picture":             "best-picture",
    "best-director":            "best-director",
    "best-actor":               "best-actor",
    "best-actress":             "best-actress",
    "best-supporting-actor":    "best-supporting-actor",
    "best-supporting-actress":  "best-supporting-actress",
    "best-adapted-screenplay":  "best-adapted-screenplay",
    "best-original-screenplay": "best-original-screenplay",
    "best-animated-feature":    "best-animated-feature",
    "best-documentary-feature": "best-documentary-feature",
    "best-international-film":  "best-international-film",  # formerly foreign-language-film
    "best-cinematography":      "best-cinematography",
    "best-film-editing":        "best-film-editing",
    "best-original-score":      "best-original-score",
    "best-original-song":       "best-original-song",
    "best-production-design":   "best-production-design",
    "best-costume-design":      "best-costume-design",
    "best-makeup-hairstyling":  "best-makeup-hairstyling",
    "best-sound":               "best-sound",
    "best-visual-effects":      "best-visual-effects",
    "best-documentary-short":   "best-documentary-short",
    "best-animated-short":      "best-animated-short",
    "best-live-action-short":   "best-live-action-short",
    # 2026 addition
    "best-casting":             "best-casting",
}

GD_ODDS_BASE = "https://www.goldderby.com/odds/oscar-odds"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_snapshot_inventory() -> pd.DataFrame:
    """
    Query Wayback Machine for all available Gold Derby Oscar odds snapshots.

    Returns a DataFrame with columns:
      category, ceremony, snapshot_ts, snapshot_url, days_before_ceremony
    """
    records = []
    for slug in CATEGORY_SLUGS:
        url_pattern = f"goldderby.com/odds/oscar-odds/{slug}/"
        print(f"  Querying CDX for: {slug}")
        snapshots = cdx_snapshots(url_pattern)

        for ceremony, date in CEREMONY_DATES.items():
            snap = best_snapshot_before(snapshots, date)
            if snap:
                from datetime import datetime
                ceremony_dt = datetime.strptime(date, "%Y%m%d")
                snap_dt = datetime.strptime(snap["timestamp"][:8], "%Y%m%d")
                days_before = (ceremony_dt - snap_dt).days
                records.append({
                    "category":          CATEGORY_SLUGS[slug],
                    "ceremony":          ceremony,
                    "snapshot_ts":       snap["timestamp"],
                    "snapshot_url":      snap["original"],
                    "days_before_ceremony": days_before,
                })
            else:
                records.append({
                    "category":          CATEGORY_SLUGS[slug],
                    "ceremony":          ceremony,
                    "snapshot_ts":       None,
                    "snapshot_url":      None,
                    "days_before_ceremony": None,
                })
    return pd.DataFrame(records)


def scrape_category(category_slug: str, ceremony: int) -> Optional[pd.DataFrame]:
    """
    Scrape a single Gold Derby category page from the Wayback Machine for a
    given ceremony number. Returns a tidy DataFrame or None if no snapshot found.
    """
    url_pattern = f"goldderby.com/odds/oscar-odds/{category_slug}/"
    snapshots = cdx_snapshots(url_pattern)
    snap = best_snapshot_before(snapshots, CEREMONY_DATES[ceremony])
    if snap is None:
        print(f"  No snapshot found: {category_slug} / ceremony {ceremony}")
        return None

    html = fetch_snapshot(snap["timestamp"], snap["original"])
    df = _parse_odds_page(html, category_slug, ceremony)
    if df is not None:
        df["snapshot_ts"] = snap["timestamp"]
        df["snapshot_url"] = snap["original"]
    return df


def scrape_all(ceremonies: Optional[list[int]] = None,
               categories: Optional[list[str]] = None) -> pd.DataFrame:
    """
    Scrape all category/ceremony combinations. Returns a single tidy DataFrame.
    Skips combinations where no snapshot is available.
    """
    ceremonies = ceremonies or list(CEREMONY_DATES.keys())
    categories = categories or list(CATEGORY_SLUGS.keys())

    frames = []
    total = len(ceremonies) * len(categories)
    n = 0
    for ceremony in ceremonies:
        for slug in categories:
            n += 1
            print(f"[{n}/{total}] ceremony={ceremony} category={slug}")
            df = scrape_category(slug, ceremony)
            if df is not None:
                frames.append(df)

    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


# ---------------------------------------------------------------------------
# HTML parsing
# ---------------------------------------------------------------------------

def _parse_odds_page(html: str, category_slug: str, ceremony: int) -> Optional[pd.DataFrame]:
    """
    Parse a Gold Derby odds page HTML into a tidy DataFrame.

    Gold Derby has evolved its page structure over the years. This parser
    attempts three strategies in order:
      1. Structured odds table (post-2021 layout)
      2. Unstructured list with inline percentages (older layout)
      3. Fallback: regex scan of entire page text
    """
    soup = BeautifulSoup(html, "lxml")
    year = _ceremony_to_year(ceremony)

    records = _parse_odds_table(soup, category_slug, ceremony, year)
    if not records:
        records = _parse_odds_list(soup, category_slug, ceremony, year)
    if not records:
        records = _parse_odds_regex(html, category_slug, ceremony, year)
    if not records:
        print(f"  WARNING: could not parse any odds from {category_slug}/{ceremony}")
        return None

    df = pd.DataFrame(records)
    # Normalize group names to lowercase
    df["group"] = df["group"].str.lower().str.strip()
    # Coerce probability to float, clip to [0, 1]
    df["probability"] = pd.to_numeric(df["probability"], errors="coerce").clip(0, 1)
    df = df.dropna(subset=["probability"])
    return df


def _parse_odds_table(soup: BeautifulSoup, category_slug: str,
                      ceremony: int, year: int) -> list[dict]:
    """
    Strategy 1: look for a table with a header row containing predictor group names
    (Experts, Editors, Users, etc.) and body rows with nominee + probability cells.
    """
    records = []
    # Gold Derby tables often have class names like "odds-table" or "predictions-table"
    tables = soup.find_all("table")
    for table in tables:
        header_row = table.find("tr")
        if not header_row:
            continue
        headers = [th.get_text(strip=True).lower() for th in header_row.find_all(["th", "td"])]
        if not any(g in headers for g in ["experts", "editors", "users", "combined", "odds"]):
            continue

        # Identify which column index maps to which group
        group_cols = {}
        for i, h in enumerate(headers):
            for group in ["experts", "editors", "users", "combined", "all-stars", "top24"]:
                if group in h:
                    group_cols[i] = group

        if not group_cols:
            # Treat single odds column as "combined"
            for i, h in enumerate(headers):
                if "odds" in h or "%" in h or "prob" in h:
                    group_cols[i] = "combined"

        nominee_col = 0  # first column is almost always the nominee name

        for row in table.find_all("tr")[1:]:
            cells = row.find_all(["td", "th"])
            if len(cells) < 2:
                continue
            nominee = cells[nominee_col].get_text(strip=True)
            if not nominee:
                continue
            for col_idx, group in group_cols.items():
                if col_idx >= len(cells):
                    continue
                raw = cells[col_idx].get_text(strip=True)
                prob = _parse_probability(raw)
                if prob is not None:
                    records.append(_make_record(category_slug, ceremony, year, nominee, group, prob))
    return records


def _parse_odds_list(soup: BeautifulSoup, category_slug: str,
                     ceremony: int, year: int) -> list[dict]:
    """
    Strategy 2: Gold Derby prediction center uses div/li elements with
    data attributes or inline text containing odds.
    """
    records = []
    # Look for elements with data-odds or data-probability attributes
    for el in soup.find_all(attrs={"data-odds": True}):
        nominee = (el.get("data-name") or el.get_text(strip=True))[:100]
        raw = el.get("data-odds", "")
        group = el.get("data-group", "combined")
        prob = _parse_probability(raw)
        if prob is not None and nominee:
            records.append(_make_record(category_slug, ceremony, year, nominee, group, prob))

    if records:
        return records

    # Fallback: look for li/div patterns like "72% — Oppenheimer"
    for el in soup.find_all(["li", "div", "span"]):
        text = el.get_text(strip=True)
        m = re.match(r"^(\d{1,3}(?:\.\d+)?)\s*%\s*[—–-]\s*(.+)$", text)
        if m:
            raw_prob, nominee = m.group(1), m.group(2).strip()[:100]
            prob = float(raw_prob) / 100.0
            records.append(_make_record(category_slug, ceremony, year, nominee, "combined", prob))

    return records


def _parse_odds_regex(html: str, category_slug: str,
                      ceremony: int, year: int) -> list[dict]:
    """
    Strategy 3: scan raw HTML text for any percentage or fractional odds
    associated with a nominee. Used as a last resort.
    """
    records = []
    # Match patterns like: "72%" or "7/2" preceded or followed by a name
    patterns = [
        r'([A-Z][^<"]{3,60}?)\s*[:\-–]\s*(\d{1,3}(?:\.\d+)?)\s*%',   # Name: 72%
        r'(\d{1,3}(?:\.\d+)?)\s*%\s*[:\-–]\s*([A-Z][^<"]{3,60})',     # 72%: Name
        r'([A-Z][^<"]{3,60}?)\s*[:\-–]\s*(\d+)\s*/\s*(\d+)',          # Name: 7/2
    ]
    for pattern in patterns:
        for m in re.finditer(pattern, html):
            groups = m.groups()
            if len(groups) == 2:
                nominee, raw = (groups[0].strip(), groups[1]) \
                    if re.match(r'[A-Z]', groups[0]) else (groups[1].strip(), groups[0])
                prob = _parse_probability(raw + "%")
            else:
                nominee = groups[0].strip()
                prob = _fractional_to_prob(groups[1], groups[2])
            if prob is not None and nominee:
                records.append(_make_record(category_slug, ceremony, year,
                                            nominee[:100], "combined", prob))
    return records


# ---------------------------------------------------------------------------
# Probability conversion helpers
# ---------------------------------------------------------------------------

def _parse_probability(raw: str) -> Optional[float]:
    """
    Parse a raw odds string into a [0, 1] float probability.
    Handles: "72%", "7/2", "3.5", "350" (implied cents on a dollar), "72.5%"
    """
    raw = raw.strip()
    # Percentage
    m = re.match(r"^(\d{1,3}(?:\.\d+)?)\s*%$", raw)
    if m:
        return float(m.group(1)) / 100.0
    # Fractional odds (e.g. "7/2") — convert to implied probability
    m = re.match(r"^(\d+)\s*/\s*(\d+)$", raw)
    if m:
        return _fractional_to_prob(m.group(1), m.group(2))
    # Plain decimal in [0, 1]
    m = re.match(r"^\d+\.\d+$", raw)
    if m:
        val = float(raw)
        if 0 <= val <= 1:
            return val
    return None


def _fractional_to_prob(numerator: str, denominator: str) -> Optional[float]:
    """Convert fractional odds (e.g. 7/2) to implied probability."""
    try:
        n, d = float(numerator), float(denominator)
        if n <= 0 or d <= 0:
            return None
        return d / (n + d)
    except (ValueError, ZeroDivisionError):
        return None


# ---------------------------------------------------------------------------
# Record construction
# ---------------------------------------------------------------------------

def _make_record(category_slug: str, ceremony: int, year: int,
                 nominee: str, group: str, probability: float) -> dict:
    return {
        "ceremony":    ceremony,
        "year":        year,
        "category":    CATEGORY_SLUGS.get(category_slug, category_slug),
        "nominee":     nominee,
        "group":       group,
        "probability": probability,
    }


def _ceremony_to_year(ceremony: int) -> int:
    date_str = CEREMONY_DATES.get(ceremony, "20200101")
    return int(date_str[:4])
