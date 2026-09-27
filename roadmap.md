# Roadmap: Optimizing Weighted Forecast Ensembles (v2)
*From a single-cycle dashboard to a validated forecasting method, ahead of the 2027 Oscars*

---

## Status (September 2026)

| Stage | What it delivers | Status |
|---|---|---|
| **v1: 2026 live model** | The dashboard in this repo: hand-weighted ensemble, run live, graded 20/24 | **Complete** |
| **Stage 1: Historical precursor dataset** | Self-owned, versioned record of Oscar and guild winners; self-computed precursor match rates | **In progress.** Schema designed ([`historical-dataset-schema.md`](historical-dataset-schema.md)), manual transcription under way |
| **Stage 2: Forecast archive** | Gold Derby and market snapshots for past cycles where recoverable, plus systematic capture during the 2027 season | Planned |
| **Stage 3: Analysis (Q0–Q3)** | Information audit, weight optimization, global vs. category weights, predictability | Planned, gated on Stages 1–2 |
| **Stage 4: 2027 model** | The dashboard rebuilt on validated weights, with explicit handling for new and low-signal categories | Planned, for the 99th Academy Awards (early 2027) |

The stages are sequenced so that each one produces something publishable on its
own. Transcription is the bottleneck, and the stages are ordered so it doesn't
block everything else.

---

## Why v2 exists

The 2026 model scored 20/24. The post-mortem ([`results.md`](results.md))
surfaced three gaps that one ceremony can't close:

1. **The weights were never validated.** They were set by hand from industry-cited
   accuracy figures. In 2026, equal weights and single markets picked the same 20
   winners.
2. **Source selection was never justified rigorously.** The markets were included
   because they were available and widely cited. The guild signals were added as a
   fixed adjustment. By ceremony day that adjustment moved nothing more than a
   point, which suggests the markets had already priced the guilds in. Whether any
   source adds *independent* signal was never tested.
3. **The accuracy figures were borrowed.** "DGA predicts Best Director ~90% of the
   time" came from secondhand reporting with an unknown time window and counting
   rules. A method is only as reproducible as its least-documented input.

v2 rebuilds the foundation, treating source selection and information redundancy
as first-order questions rather than assumptions.

---

## The general problem

Many real-world forecasts blend several imperfect sources: expert panels,
leading indicators, statistical models, market prices. Each has its own accuracy
profile, biases, and information base. The usual approach is a weighted blend.
But before optimizing weights, a more basic question needs an answer: **which
sources carry independent signal, and which are redundant?**

The Oscars are a clean test case for that question:

- Each category has a binary outcome per nominee.
- Forecast sources with historical records exist.
- Outcomes resolve on a fixed date.
- The structure recurs every year, so methods can be validated across cycles.

The patterns involved generalize directly to demand forecasting, churn and risk
scoring, and any setting where several signals are combined into one estimate:

- redundancy testing (feature selection and multicollinearity)
- constrained weight optimization
- calibration analysis
- segment-specific model evaluation

---

## Research questions

**Q0: Which sources carry independent predictive signal?**
How correlated are the precursor ceremonies, the expert aggregator, and the
prediction markets? After accounting for what the markets already know, do
precursor results add predictive information, or are they priced in? Does each
source's accuracy differ by category type? The output is a reasoned, written
decision about which sources enter the ensemble and why.
*Business analogue: feature selection and multicollinearity analysis before
fitting any model.*

**Q1: Does systematic weight optimization beat intuition-based blending?**
Which weights minimize Brier score across historical cycles? Do they beat the
2026 hand-tuned weights and a naive equal-weight baseline?
*Business analogue: any multi-source forecast blend.*

**Q2: Do optimal weights vary by category type, or is one global set enough?**
Does a source's optimal weight differ between Best Picture and Best Animated
Short? Do category-group weights beat global weights out of sample, or do they
just overfit? The 2026 model *assumed* category groups mattered. Q2 tests that
assumption.
*Business analogue: one model vs. segment-specific models.*

**Q3: Which prediction problems are inherently harder, and why?**
Can category type, cross-source agreement, precursor availability, or
probability concentration predict which categories will be hard to call in
advance, rather than discovering it on ceremony night?
*Business analogue: knowing where a forecast deserves confidence and where to
surface a warning.*

---

## Stage 1: Historical precursor dataset (in progress)

A self-owned dataset of Oscar and precursor winners, built from primary sources
with per-row provenance. The full design is in
[`historical-dataset-schema.md`](historical-dataset-schema.md). It includes:

- stable IDs
- name-history tables
- a concept crosswalk
- eligibility exceptions
- alignment on eligibility year rather than ceremony date

**Staged collection.** The complete v1 target is:

- 8 award bodies (Oscar, DGA, PGA, SAG, WGA, BAFTA, Critics Choice, Golden Globes)
- the "big eight" categories
- 2000 to present

To avoid waiting on the full backfill, collection happens in two passes:

| Pass | Bodies | Years | Why this first |
|---|---|---|---|
| **1a** | Oscar + DGA, PGA, SAG, WGA | 2015–2025 eligibility years | The four guilds the 2026 model used, over roughly a decade. Enough to replace the borrowed match rates with self-computed ones and to overlap the years forecast data exists for. |
| **1b** | + BAFTA, Critics Choice, Golden Globes | extend to 2000–2025 | Full candidate pool for Q0, and a 25-year window comparable to published analyses, so self-computed rates can be checked against them. |

**Standalone deliverable after pass 1a:** a table of self-computed precursor
match rates, per guild and per category, with the query and definition behind
each one. This replaces the borrowed figures in v1 even before any modeling
begins. With roughly 11 years per rate, the figures will carry wide uncertainty.
They'll be reported with that uncertainty stated, not as point estimates.

---

## Stage 2: Forecast archive

| Source | Historical availability | Plan |
|---|---|---|
| **Gold Derby** | Reasonable for roughly 2019 onward, via archived snapshots (Wayback Machine). Some years more complete than others. | Recover final pre-ceremony odds where possible; document gaps. |
| **Kalshi** | Oscar markets are recent; expect 2–3 cycles at most. | Public API and archived coverage. |
| **Polymarket** | Similar to Kalshi. | Public API; third-party archives. |
| **All three, 2027 season** | n/a | **Capture snapshots going forward** at fixed points: nominations, after each guild ceremony, final-voting close, and ceremony day. Store them in the dataset's `forecasts` table so the next cycle doesn't depend on archives. |

**Decision gate** (carried over from the original scope): the analysis needs at
least four years of precursor data (near-certain) and at least one probabilistic
source with reasonable category coverage. If market data covers fewer than two
full cycles, the markets become supplementary and the ensemble centers on
precursors plus Gold Derby. That decision will be documented, not hidden.

---

## Stage 3: Analysis

### Metrics
- **Primary: Brier score.** `mean((predicted probability − outcome)²)`. It
  penalizes confident wrong calls more than hedged ones, which is the right
  failure mode to care about for probability forecasts. It's implemented from
  scratch so the logic stays visible.
- **Secondary: top-pick accuracy**, for readability.
- **Validation: leave-one-year-out cross-validation** throughout. Every reported
  performance number is out of sample.

### Q0: information audit
- **Pairwise correlation** of source probabilities across categories and years,
  shown as a heatmap. Very high correlation (>0.90) flags a candidate redundancy.
- **Incremental predictive value.** Start from the single best source, add each
  other source one at a time, and measure the change in cross-validated Brier
  score. No meaningful improvement means the added source is redundant given the
  first.
- **Category-type accuracy profiles.** Each source's accuracy and Brier score
  broken out by category group.
- **Output:** a written source-selection decision that everything after it builds
  on.

### Q1: weight optimization
- Constrained minimization of Brier score (weights ≥ 0, sum to 1) using
  `scipy.optimize.minimize` (SLSQP).
- A cross-validated logistic regression as a second estimate. One row per
  nominee, the outcome is win/no-win, and each retained source's probability is a
  predictor.
- **Four models compared:**
  1. Equal weights
  2. The 2026 hand-tuned weights
  3. Best single source
  4. Optimized weights
- Small samples mean differences may not be statistically significant. The
  write-up will say so plainly if that's the result.

### Q2: global vs. category-group weights
- The Q1 optimization run twice: once with one global weight set, once with
  separate sets for three groups. The groups are a hypothesis Q0 may revise:
  - **Major:** Picture, Director, four acting
  - **Craft/technical:** including screenplay
  - **Shorts & documentary:** including International Feature
- Out-of-sample Brier scores compared overall and by group. The weight vectors
  themselves are reported as findings.
- These groups differ from the six used in the 2026 dashboard on purpose. The
  2026 groups were set by intuition, and these will be tested.

### Q3: category predictability
- Each category's mean Brier score across years, used as a difficulty score and
  ranked.
- Does category type predict difficulty? Tested with Kruskal-Wallis or ANOVA.
- Does cross-source disagreement (the standard deviation of source probabilities)
  predict difficulty?
- Does market volume, where available, predict accuracy?
- k-means (k = 3) to see whether natural easy/medium/hard clusters emerge.

---

## Stage 4: The 2027 model

The payoff: a 2027 dashboard that runs on evidence rather than intuition.

- **Weights from Stage 3.** If nothing beats equal weights out of sample, the 2027
  model will use equal weights and say why. That is a valid result, not a failure.
- **Sources chosen by the Q0 audit**, not by availability.
- **Self-computed precursor rates** replace the industry-cited ones, with their
  uncertainty shown.
- **Explicit low-signal handling**, which directly addresses the 2026 Casting
  miss:
  - categories with no historical base rate are flagged
  - categories Q3 identifies as structurally hard get wider uncertainty
- **Stable nominee IDs** instead of name matching. The 2026 build had a silent
  name-matching bug ([`decisions.md`](decisions.md)).
- **A frozen pre-ceremony forecast**, graded afterward with the same scorecard as
  2026, so the two years compare directly.

---

## Planned repository additions

v2 will live alongside the 2026 dashboard in this repository:

```
analysis/
├── requirements.txt
├── data/
│   ├── raw/                     # transcribed CSVs, never modified after commit
│   └── processed/               # cleaned, analysis-ready tables
└── notebooks/
    ├── 01_data_collection.ipynb
    ├── 02_information_audit.ipynb     # Q0
    ├── 03_eda.ipynb                   # calibration, accuracy by year and type
    ├── 04_model_validation.ipynb      # Q1
    ├── 05_category_weights.ipynb      # Q2
    └── 06_category_analysis.ipynb     # Q3
```

**Tools:**

- Python: pandas, NumPy, SciPy (optimization and statistical tests)
- scikit-learn: logistic regression, cross-validation, k-means
- matplotlib and seaborn

This is a tabular problem. Deep learning is deliberately out of scope.

---

## Out of scope

- A live or automated data pipeline. v2 is a retrospective analysis, plus
  snapshot capture during the season.
- Qualitative signals as model inputs (reviews, narrative momentum, voter
  surveys). These are still tracked for comparison, as in 2026.
- Predicting nominations. v2 predicts winners among the announced nominees.
- Best Casting in the statistical analysis. It was first awarded in 2026, and one
  year of data supports no inference.

---

## Working standards

- **Readable over clever.** Commented, plainly structured code. Every notebook
  runs top to bottom without errors.
- **Methodology before domain.** Each notebook opens by stating the general
  analytical question before the Oscar-specific data. Names are domain-neutral
  where practical (`forecast_sources`, `outcome`, `event_type`).
- **Data surprises get documented, not smoothed over.** When the data turns out
  different from this plan (it will), the change and its reasoning go in a
  markdown cell.
- **Honest results.** If optimized weights barely beat equal weights, or a source
  proves redundant, the write-up leads with that. A clearly communicated null
  result is a finding.
