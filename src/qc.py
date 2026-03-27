"""
Data Quality Control module.

Provides a composable set of checks that operate on standardized DataFrames.
Each check returns a QCResult with a pass/fail status, a severity level,
and a detail message. The run_all() function executes all applicable checks
and produces a printed report plus a summary DataFrame.

Expected DataFrame schema (canonical format produced by each scraper):
  ceremony    int     Oscar ceremony number (91–98)
  year        int     Calendar year of ceremony
  category    str     Standardized category slug (e.g. "best-picture")
  nominee     str     Nominee name/film
  group       str     Predictor group ("experts"|"editors"|"users"|"combined")
  probability float   Win probability in [0, 1]
  source      str     Data source label ("gold_derby"|"kalshi"|"polymarket"|"precursor")
  winner      bool    (optional) Whether this nominee actually won

QC checks implemented:
  1.  schema_check          — required columns present and correctly typed
  2.  probability_range     — all probabilities in [0, 1]
  3.  probability_sum       — per (year, category, group, source): probs sum to ~1
  4.  completeness          — expected year × category combinations are present
  5.  duplicate_rows        — no duplicate (year, category, nominee, group, source) tuples
  6.  missing_values        — no NaN in required columns
  7.  nominee_coverage      — nominee lists are non-trivially small (≥ 3 per race)
  8.  winner_coverage       — if winner column present, exactly 1 winner per race
  9.  frontrunner_sanity    — the actual winner was in the top-3 by probability
  10. cross_source_agreement — for shared year/category, sources agree on top pick >70% of races
  11. snapshot_recency      — snapshots are within 7 days of ceremony date
  12. probability_entropy   — races are not uniformly flat (entropy check) or degenerate
"""

from __future__ import annotations

import textwrap
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

REQUIRED_COLUMNS = {
    "ceremony":    "int64",
    "year":        "int64",
    "category":    "object",
    "nominee":     "object",
    "group":       "object",
    "probability": "float64",
    "source":      "object",
}

OPTIONAL_COLUMNS = {"winner": "bool", "snapshot_ts": "object", "snapshot_url": "object"}

SEVERITY_LEVELS = ("info", "warning", "error", "critical")

# Expected ceremonies and a representative set of major categories
EXPECTED_CEREMONIES = list(range(91, 99))  # 91–98

MAJOR_CATEGORIES = {
    "best-picture", "best-director",
    "best-actor", "best-actress",
    "best-supporting-actor", "best-supporting-actress",
}

ALL_CATEGORIES = MAJOR_CATEGORIES | {
    "best-adapted-screenplay", "best-original-screenplay",
    "best-animated-feature", "best-documentary-feature",
    "best-international-film", "best-cinematography",
    "best-film-editing", "best-original-score", "best-original-song",
    "best-production-design", "best-costume-design",
    "best-makeup-hairstyling", "best-sound", "best-visual-effects",
    "best-documentary-short", "best-animated-short", "best-live-action-short",
}

# Oscar ceremony dates (YYYYMMDD) for snapshot recency checks
CEREMONY_DATES = {
    91: "20190224", 92: "20200209", 93: "20210425",
    94: "20220327", 95: "20230312", 96: "20240310",
    97: "20250302", 98: "20260315",
}


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------

@dataclass
class QCResult:
    check_name: str
    passed: bool
    severity: str          # "info" | "warning" | "error" | "critical"
    message: str
    detail: Optional[pd.DataFrame] = field(default=None, repr=False)

    def __str__(self) -> str:
        icon = "✓" if self.passed else ("!" if self.severity == "warning" else "✗")
        return f"  [{icon}] {self.check_name}: {self.message}"


@dataclass
class QCReport:
    source_label: str
    results: list[QCResult]

    @property
    def passed(self) -> bool:
        return all(r.passed for r in self.results if r.severity in ("error", "critical"))

    def summary_df(self) -> pd.DataFrame:
        return pd.DataFrame([{
            "check":    r.check_name,
            "passed":   r.passed,
            "severity": r.severity,
            "message":  r.message,
        } for r in self.results])

    def print(self, show_detail: bool = True) -> None:
        status = "PASS" if self.passed else "FAIL"
        print(f"\n{'='*60}")
        print(f"  QC Report — {self.source_label}  [{status}]")
        print(f"{'='*60}")
        for r in self.results:
            print(str(r))
            if show_detail and not r.passed and r.detail is not None:
                detail_str = r.detail.to_string(index=False)
                for line in detail_str.split("\n")[:20]:  # cap at 20 lines
                    print(f"        {line}")
                if len(r.detail) > 20:
                    print(f"        ... ({len(r.detail) - 20} more rows)")
        n_pass = sum(r.passed for r in self.results)
        print(f"\n  {n_pass}/{len(self.results)} checks passed")
        print(f"{'='*60}\n")


# ---------------------------------------------------------------------------
# Individual check functions
# ---------------------------------------------------------------------------

def check_schema(df: pd.DataFrame) -> QCResult:
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        return QCResult("schema_check", False, "critical",
                        f"Missing required columns: {missing}")
    wrong_types = {}
    for col, expected_dtype in REQUIRED_COLUMNS.items():
        actual = str(df[col].dtype)
        # Coerce-compatible check (int64 vs Int64, object vs string, etc.)
        if not _dtype_compatible(actual, expected_dtype):
            wrong_types[col] = f"{actual} (expected {expected_dtype})"
    if wrong_types:
        detail = pd.DataFrame(
            [{"column": k, "issue": v} for k, v in wrong_types.items()]
        )
        return QCResult("schema_check", False, "warning",
                        f"{len(wrong_types)} column(s) have unexpected dtype", detail)
    return QCResult("schema_check", True, "info",
                    f"All {len(REQUIRED_COLUMNS)} required columns present with correct types")


def check_missing_values(df: pd.DataFrame) -> QCResult:
    null_counts = {c: int(df[c].isna().sum()) for c in REQUIRED_COLUMNS if c in df.columns}
    nonzero = {k: v for k, v in null_counts.items() if v > 0}
    if not nonzero:
        return QCResult("missing_values", True, "info", "No missing values in required columns")
    detail = pd.DataFrame([{"column": k, "null_count": v, "pct": f"{100*v/len(df):.1f}%"}
                            for k, v in nonzero.items()])
    severity = "critical" if "probability" in nonzero or "category" in nonzero else "warning"
    return QCResult("missing_values", False, severity,
                    f"{len(nonzero)} column(s) contain NaN values", detail)


def check_probability_range(df: pd.DataFrame) -> QCResult:
    if "probability" not in df.columns:
        return QCResult("probability_range", False, "critical", "probability column missing")
    out = df[(df["probability"] < 0) | (df["probability"] > 1)]
    if out.empty:
        return QCResult("probability_range", True, "info",
                        "All probabilities within [0, 1]")
    detail = out[["ceremony", "category", "nominee", "group", "probability"]].head(30)
    return QCResult("probability_range", False, "critical",
                    f"{len(out)} rows have probability outside [0, 1]", detail)


def check_probability_sum(df: pd.DataFrame, tolerance: float = 0.10) -> QCResult:
    """
    For each (ceremony, category, group, source), probabilities should sum to ~1.
    Tolerance of 0.10 allows for rounding and partial data; anything outside
    [0.5, 1.5] is flagged as an error.
    """
    if not all(c in df.columns for c in ["ceremony", "category", "group", "source", "probability"]):
        return QCResult("probability_sum", False, "warning", "Required columns for sum check missing")

    key_cols = ["ceremony", "category", "group", "source"]
    sums = df.groupby(key_cols)["probability"].sum().reset_index()
    sums.columns = key_cols + ["prob_sum"]

    warning_thresh = tolerance
    error_thresh = 0.40  # >40% off from 1.0 = definite problem

    errors = sums[(sums["prob_sum"] - 1).abs() > error_thresh]
    warnings = sums[
        ((sums["prob_sum"] - 1).abs() > warning_thresh) &
        ((sums["prob_sum"] - 1).abs() <= error_thresh)
    ]

    if errors.empty and warnings.empty:
        return QCResult("probability_sum", True, "info",
                        f"All probability sums within ±{tolerance} of 1.0 "
                        f"({len(sums)} race-groups checked)")
    detail_rows = []
    for _, row in errors.iterrows():
        detail_rows.append({**row.to_dict(), "severity": "error"})
    for _, row in warnings.iterrows():
        detail_rows.append({**row.to_dict(), "severity": "warning"})
    detail = pd.DataFrame(detail_rows).sort_values("prob_sum")
    severity = "error" if not errors.empty else "warning"
    return QCResult("probability_sum", len(errors) == 0, severity,
                    f"{len(errors)} error(s), {len(warnings)} warning(s) in probability sums",
                    detail)


def check_completeness(df: pd.DataFrame,
                       expected_ceremonies: Optional[list[int]] = None,
                       expected_categories: Optional[set[str]] = None,
                       source_filter: Optional[str] = None) -> QCResult:
    """
    Check that expected (ceremony, category) combinations are present.
    Uses EXPECTED_CEREMONIES and MAJOR_CATEGORIES as defaults.
    """
    ceremonies = expected_ceremonies or EXPECTED_CEREMONIES
    categories = expected_categories or MAJOR_CATEGORIES
    sub = df.copy()
    if source_filter:
        sub = sub[sub["source"] == source_filter]

    present = set(zip(sub["ceremony"], sub["category"]))
    expected = {(c, cat) for c in ceremonies for cat in categories}
    missing = sorted(expected - present)

    if not missing:
        return QCResult("completeness", True, "info",
                        f"All {len(expected)} expected (ceremony × category) combinations present")
    detail = pd.DataFrame(missing, columns=["ceremony", "category"])
    severity = "error" if len(missing) > len(expected) * 0.25 else "warning"
    return QCResult("completeness", False, severity,
                    f"{len(missing)}/{len(expected)} expected combinations missing", detail)


def check_duplicates(df: pd.DataFrame) -> QCResult:
    key_cols = ["ceremony", "category", "nominee", "group", "source"]
    key_cols = [c for c in key_cols if c in df.columns]
    dupes = df[df.duplicated(subset=key_cols, keep=False)]
    if dupes.empty:
        return QCResult("duplicate_rows", True, "info",
                        f"No duplicate rows (key: {key_cols})")
    detail = dupes.sort_values(key_cols)[key_cols + ["probability"]].head(30)
    return QCResult("duplicate_rows", False, "error",
                    f"{len(dupes)} duplicate rows found", detail)


def check_nominee_coverage(df: pd.DataFrame, min_nominees: int = 3) -> QCResult:
    """Each race should have at least min_nominees candidates."""
    key_cols = ["ceremony", "category", "group", "source"]
    key_cols = [c for c in key_cols if c in df.columns]
    counts = df.groupby(key_cols)["nominee"].nunique().reset_index()
    counts.columns = key_cols + ["nominee_count"]
    thin = counts[counts["nominee_count"] < min_nominees]
    if thin.empty:
        return QCResult("nominee_coverage", True, "info",
                        f"All races have ≥ {min_nominees} nominees")
    detail = thin.sort_values("nominee_count")
    return QCResult("nominee_coverage", False, "warning",
                    f"{len(thin)} races have fewer than {min_nominees} nominees", detail)


def check_winner_coverage(df: pd.DataFrame) -> QCResult:
    """If winner column present: exactly 1 winner per (ceremony, category)."""
    if "winner" not in df.columns:
        return QCResult("winner_coverage", True, "info",
                        "winner column not present — skipping")
    key = ["ceremony", "category"]
    winner_counts = (df[df["winner"] == True]
                     .groupby(key)["nominee"].count()
                     .reset_index(name="winner_count"))
    bad = winner_counts[winner_counts["winner_count"] != 1]
    if bad.empty:
        return QCResult("winner_coverage", True, "info",
                        "Exactly 1 winner per (ceremony, category)")
    detail = bad
    return QCResult("winner_coverage", False, "error",
                    f"{len(bad)} races have ≠ 1 winner", detail)


def check_frontrunner_sanity(df: pd.DataFrame) -> QCResult:
    """
    For resolved races (where winner column is present), the actual winner
    should have been ranked in the top 3 by probability.
    """
    if "winner" not in df.columns:
        return QCResult("frontrunner_sanity", True, "info",
                        "winner column not present — skipping")

    key_cols = ["ceremony", "category", "group", "source"]
    key_cols = [c for c in key_cols if c in df.columns]

    failures = []
    for keys, group_df in df.groupby(key_cols):
        winner_rows = group_df[group_df["winner"] == True]
        if winner_rows.empty:
            continue
        winner_name = winner_rows.iloc[0]["nominee"]
        ranked = group_df.sort_values("probability", ascending=False).reset_index(drop=True)
        top3 = set(ranked.head(3)["nominee"])
        if winner_name not in top3:
            winner_prob = winner_rows.iloc[0]["probability"]
            top1_prob = ranked.iloc[0]["probability"]
            key_dict = dict(zip(key_cols, keys if isinstance(keys, tuple) else [keys]))
            failures.append({**key_dict, "winner": winner_name,
                              "winner_prob": round(winner_prob, 3),
                              "top1_nominee": ranked.iloc[0]["nominee"],
                              "top1_prob": round(top1_prob, 3)})

    if not failures:
        n_races = df.groupby(key_cols).ngroups
        return QCResult("frontrunner_sanity", True, "info",
                        f"Winner in top 3 for all {n_races} resolved races")
    detail = pd.DataFrame(failures)
    pct = 100 * len(failures) / max(df.groupby(key_cols).ngroups, 1)
    severity = "error" if pct > 30 else "warning"
    return QCResult("frontrunner_sanity", False, severity,
                    f"Winner outside top 3 in {len(failures)} races ({pct:.1f}%)", detail)


def check_cross_source_agreement(df: pd.DataFrame,
                                  min_agreement: float = 0.60) -> QCResult:
    """
    For races covered by multiple sources, check that sources agree on the
    top-probability nominee in at least min_agreement fraction of races.
    """
    if "source" not in df.columns or df["source"].nunique() < 2:
        return QCResult("cross_source_agreement", True, "info",
                        "Fewer than 2 sources — cross-source check skipped")

    race_key = ["ceremony", "category"]
    # For each source, find the top nominee per race (using combined group if available)
    sub = df[df["group"].isin(["combined", "users"])].copy()
    if sub.empty:
        sub = df.copy()

    top_nominees = (sub.sort_values("probability", ascending=False)
                      .groupby(race_key + ["source"])
                      .first()["nominee"]
                      .reset_index())

    # Pivot: rows = (ceremony, category), cols = source, values = top nominee
    pivot = top_nominees.pivot_table(index=race_key, columns="source",
                                      values="nominee", aggfunc="first")
    pivot = pivot.dropna()  # only races covered by all sources

    if pivot.empty or len(pivot.columns) < 2:
        return QCResult("cross_source_agreement", True, "info",
                        "No races covered by multiple sources simultaneously")

    sources = pivot.columns.tolist()
    # Check pairwise agreement across all source pairs
    pair_results = []
    for i in range(len(sources)):
        for j in range(i + 1, len(sources)):
            s1, s2 = sources[i], sources[j]
            agree = (pivot[s1] == pivot[s2]).mean()
            pair_results.append({"source_a": s1, "source_b": s2,
                                   "races": len(pivot), "agreement": round(agree, 3)})

    detail = pd.DataFrame(pair_results)
    low_pairs = detail[detail["agreement"] < min_agreement]

    if low_pairs.empty:
        return QCResult("cross_source_agreement", True, "info",
                        f"All source pairs agree on top pick in ≥{min_agreement:.0%} of races\n"
                        + detail.to_string(index=False))
    return QCResult("cross_source_agreement", False, "warning",
                    f"{len(low_pairs)} source pair(s) agree on top pick "
                    f"< {min_agreement:.0%} of the time", low_pairs)


def check_snapshot_recency(df: pd.DataFrame, max_days_before: int = 7) -> QCResult:
    """
    For Gold Derby data: snapshot_ts should be within max_days_before days
    of the ceremony date.
    """
    if "snapshot_ts" not in df.columns or "ceremony" not in df.columns:
        return QCResult("snapshot_recency", True, "info",
                        "snapshot_ts column not present — skipping")

    from datetime import datetime
    issues = []
    for _, row in df.drop_duplicates(["ceremony", "snapshot_ts"]).iterrows():
        ts = str(row["snapshot_ts"])[:8]
        ceremony = row["ceremony"]
        ceremony_date_str = CEREMONY_DATES.get(int(ceremony))
        if not ceremony_date_str:
            continue
        try:
            snap_dt = datetime.strptime(ts, "%Y%m%d")
            ceremony_dt = datetime.strptime(ceremony_date_str, "%Y%m%d")
            days_before = (ceremony_dt - snap_dt).days
            if days_before < 0:
                issues.append({"ceremony": ceremony, "snapshot_ts": ts,
                                "days_before": days_before, "issue": "snapshot AFTER ceremony"})
            elif days_before > max_days_before:
                issues.append({"ceremony": ceremony, "snapshot_ts": ts,
                                "days_before": days_before,
                                "issue": f">{max_days_before} days before ceremony"})
        except ValueError:
            issues.append({"ceremony": ceremony, "snapshot_ts": ts,
                            "days_before": None, "issue": "could not parse timestamp"})

    if not issues:
        return QCResult("snapshot_recency", True, "info",
                        f"All snapshots within {max_days_before} days of ceremony")
    detail = pd.DataFrame(issues)
    return QCResult("snapshot_recency", False, "warning",
                    f"{len(issues)} snapshot(s) outside acceptable recency window", detail)


def check_probability_entropy(df: pd.DataFrame) -> QCResult:
    """
    Flag races where all nominees have near-equal probability (flat/uninformative)
    or a single nominee has probability > 0.999 (degenerate/post-hoc data).
    """
    key_cols = ["ceremony", "category", "group", "source"]
    key_cols = [c for c in key_cols if c in df.columns]

    flat_races, degenerate_races = [], []
    for keys, group_df in df.groupby(key_cols):
        probs = group_df["probability"].values
        if len(probs) < 2:
            continue
        entropy = -np.sum(probs * np.log(probs + 1e-12)) / np.log(len(probs) + 1e-12)
        top_prob = probs.max()
        key_dict = dict(zip(key_cols, keys if isinstance(keys, tuple) else [keys]))
        if entropy > 0.98:  # nearly uniform
            flat_races.append({**key_dict, "entropy": round(float(entropy), 3),
                                "top_prob": round(float(top_prob), 3)})
        if top_prob > 0.999:  # one nominee at 100%
            degenerate_races.append({**key_dict, "entropy": round(float(entropy), 3),
                                      "top_prob": round(float(top_prob), 3)})

    issues = flat_races + degenerate_races
    if not issues:
        return QCResult("probability_entropy", True, "info",
                        "No flat or degenerate probability distributions detected")
    detail = pd.DataFrame(issues).drop_duplicates()
    msg = f"{len(flat_races)} flat races, {len(degenerate_races)} degenerate (100%) races"
    severity = "warning" if len(degenerate_races) == 0 else "error"
    return QCResult("probability_entropy", False, severity, msg, detail)


# ---------------------------------------------------------------------------
# Master runner
# ---------------------------------------------------------------------------

def run_all(df: pd.DataFrame, source_label: str = "unknown",
            expected_ceremonies: Optional[list[int]] = None,
            expected_categories: Optional[set[str]] = None,
            show_detail: bool = True) -> QCReport:
    """
    Run all applicable QC checks on df and print a formatted report.
    Returns a QCReport whose .summary_df() gives a machine-readable summary.
    """
    checks = [
        check_schema(df),
        check_missing_values(df),
        check_probability_range(df),
        check_probability_sum(df),
        check_completeness(df, expected_ceremonies, expected_categories),
        check_duplicates(df),
        check_nominee_coverage(df),
        check_winner_coverage(df),
        check_frontrunner_sanity(df),
        check_cross_source_agreement(df),
        check_snapshot_recency(df),
        check_probability_entropy(df),
    ]
    report = QCReport(source_label=source_label, results=checks)
    report.print(show_detail=show_detail)
    return report


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _dtype_compatible(actual: str, expected: str) -> bool:
    compat = {
        "int64":   {"int64", "int32", "Int64", "int"},
        "float64": {"float64", "float32", "Float64", "float"},
        "object":  {"object", "string", "str"},
        "bool":    {"bool", "boolean"},
    }
    return actual in compat.get(expected, {expected})
