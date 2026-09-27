# Historical Awards Dataset: Schema & Data Dictionary
*A self-owned, version-controlled dataset of Academy Award and precursor outcomes, designed for reproducible accuracy analysis over time.*

**Status (September 2026):** the design is settled, and manual transcription is
in progress. This dataset is Stage 1 of the [v2 roadmap](roadmap.md). The 2026
dashboard does **not** depend on it.

---

## Purpose

This dataset exists to answer one class of question rigorously and reproducibly:
**how well does a given award (or forecast source) predict the eventual Oscar
winner, and how does that vary by category and over time?**

The design goal is that every accuracy figure the project publishes can be
computed directly from this dataset with a documented method. It should never be
borrowed from an outside source whose time window and counting rules are
unknown. When someone asks "where does the 90% DGA number come from?", the answer
should be "this dataset, this query, this definition," not "an article." The 2026
model *did* rely on borrowed figures like that. This dataset is how v2 stops.

---

## Core design principles

**1. Stable IDs, separate from display names.** Award bodies and categories get
renamed: SAG became the "Actor Awards," and "Best Foreign Language Film" became
"Best International Feature Film." Every entity has a permanent, opaque
identifier that never changes. Human-readable names live in separate history
tables, bounded by year. All analysis joins on the stable ID, and names are for
display and verification only.

**2. One concept, many surface forms.** The abstract thing being predicted, say
"the lead actor award," is modeled once as a *concept category*. Each body's
actual category maps to that concept, even when it's named differently, split in
two, or only a loose proxy. This is what makes cross-body comparison valid.

**3. The fact table is at nomination grain, not winner grain.** Each row is one
nominee in one category at one body in one year, with a `won` flag. A
winners-only analysis is just `WHERE won = TRUE`, so adding full nominee slates
later needs no restructuring.

**4. Align on eligibility year, never ceremony date.** See the idiosyncrasy
below. This is the single most important design decision in the dataset.

**5. Encode exceptions explicitly.** Eligibility gaps, disrupted ceremonies, and
non-comparable cases are recorded as data, not left implicit. Accuracy
calculations can then *exclude* them by rule instead of silently counting them
as prediction misses.

---

## The most important idiosyncrasy: year alignment

The Oscars honor films from an eligibility year, but the ceremony happens early
the *following* calendar year. Precursors hold their ceremonies mostly in the
weeks before the Oscars, also in that following year. And each body numbers its
editions differently ("98th Academy Awards," "78th DGA Awards").

Join the DGA to the Oscars on ceremony date or edition number, and everything
silently breaks.

**Everything aligns on `award_year`, the film-eligibility year** (the "class" of
films being honored):

- Films released in **2025** have `award_year = 2025`.
- They are honored at ceremonies held in **early 2026** (Oscars, DGA, PGA, and
  so on).
- The 98th Academy Awards and the 78th DGA Awards both carry `award_year = 2025`.

Ceremony dates and edition numbers are stored on the `editions` table for
reference and display, but they are never a join key.

---

## Entity-relationship overview

```
award_bodies ─────< award_body_names        (name history per body)
      │
      └──< body_categories >──── concept_categories
                  │                      │
                  │                      └── defines match_entity, Oscar equivalence
                  │
                  └──< body_category_names  (name history per category)

editions                 (one row per body × award_year: ceremony date, edition #, disruptions)
nominations              (THE FACT TABLE: body × award_year × body_category × nominee, won flag)
eligibility_exceptions   (documented non-comparable cases, e.g. WGA ineligibility)
forecasts                (FORWARD-LOOKING: source × snapshot × nominee × probability)
```

---

## Table specifications

### `award_bodies`: dimension
One row per awarding organization. The stable anchor for everything.

| Column | Type | Notes |
|--------|------|-------|
| `award_body_id` | TEXT (PK) | Permanent opaque slug: `oscar`, `dga`, `pga`, `wga`, `sag`, `bafta`, `cca`, `gg`. Never changes, even if the organization renames itself. |
| `current_name` | TEXT | Current display name. Full history is in `award_body_names`. |
| `body_type` | TEXT | `academy`, `guild`, `critics`, `press`, `market`, `aggregator`. Classified by who votes: `oscar` and `bafta` = `academy`; `gg` = `press`. |
| `is_target` | BOOLEAN | TRUE only for `oscar`, the thing being predicted. |
| `notes` | TEXT | Free text. |

### `award_body_names`: name history
Handles renames like SAG becoming the Actor Awards without losing
period-accurate display names.

| Column | Type | Notes |
|--------|------|-------|
| `award_body_id` | TEXT (FK) | → `award_bodies` |
| `name` | TEXT | Name used during this span, e.g., "Screen Actors Guild Awards" or "Actor Awards." |
| `valid_from_year` | INT | First `award_year` this name applied to. |
| `valid_to_year` | INT (nullable) | Last `award_year`. NULL = current. |

### `concept_categories`: dimension
The analysis-level categories, the units of cross-body comparison. Mostly
defined to mirror Oscar categories, since the Oscar is the prediction target.

| Column | Type | Notes |
|--------|------|-------|
| `concept_category_id` | TEXT (PK) | Permanent slug: `best_picture`, `best_director`, `lead_actor`, `lead_actress`, `supp_actor`, `supp_actress`, `orig_screenplay`, `adapted_screenplay`. |
| `current_name` | TEXT | Display name. |
| `match_entity` | TEXT | `film` or `person`. Declares what a win is matched on across bodies (see "Match entity" below). |
| `has_oscar_equivalent` | BOOLEAN | Almost always TRUE. FALSE only for a concept with no Oscar counterpart. |
| `oscar_category_slug` | TEXT | Denormalized convenience column naming the matching Oscar category. It helps orient data entry and is never used in analysis joins. |
| `notes` | TEXT | |

### `body_categories`: dimension (the crosswalk)
Each *actual* category at each body, mapped to its concept. This is where SAG
Ensemble → Best Picture (proxy) and the Golden Globes' two lead-actor awards →
one concept (split) get encoded.

| Column | Type | Notes |
|--------|------|-------|
| `body_category_id` | TEXT (PK) | Permanent slug: `sag_ensemble`, `gg_lead_actor_drama`, `gg_lead_actor_comedy`, `dga_feature`. |
| `award_body_id` | TEXT (FK) | → `award_bodies` |
| `concept_category_id` | TEXT (FK) | → `concept_categories`. The crosswalk. |
| `mapping_type` | TEXT | `direct` (true equivalent), `proxy` (loose predictor, e.g., SAG Ensemble → Best Picture), or `split` (one of several body categories mapping to one concept, e.g., Globes drama + comedy). |
| `current_name` | TEXT | Display name. History is in `body_category_names`. |
| `active_from_year` | INT | First `award_year` the category existed at this body. |
| `active_to_year` | INT (nullable) | Last year. NULL = still active. |
| `notes` | TEXT | |

### `body_category_names`: name history
Same pattern as `award_body_names`, for category renames. Example: Best Foreign
Language Film became Best International Feature Film from `award_year` 2019.

| Column | Type | Notes |
|--------|------|-------|
| `body_category_id` | TEXT (FK) | → `body_categories` |
| `name` | TEXT | Period-accurate name. |
| `valid_from_year` | INT | |
| `valid_to_year` | INT (nullable) | NULL = current. |

### `editions`: dimension
One row per (body, award_year). Holds ceremony metadata and disruptions.

| Column | Type | Notes |
|--------|------|-------|
| `award_body_id` | TEXT (FK) | → `award_bodies` |
| `award_year` | INT | Film-eligibility year, the universal join key. |
| `edition_number` | INT (nullable) | E.g., 98 for the 98th Academy Awards. Reference only. |
| `ceremony_date` | DATE (nullable) | Reference only. Never a join key. |
| `disrupted` | BOOLEAN | TRUE for COVID-affected or otherwise irregular editions. |
| `notes` | TEXT | E.g., "Ceremony delayed to April 2021 due to COVID-19." |

PK = (`award_body_id`, `award_year`)

### `nominations`: fact table
The heart of the dataset. One row per nominee per category per body per year.

| Column | Type | Notes |
|--------|------|-------|
| `nomination_id` | TEXT/INT (PK) | Surrogate key. |
| `award_body_id` | TEXT (FK) | → `award_bodies` |
| `award_year` | INT | Universal join key. |
| `body_category_id` | TEXT (FK) | → `body_categories` |
| `film_key` | TEXT (nullable) | Normalized film slug, e.g., `sinners_2025`. NULL only if truly not applicable. |
| `person_key` | TEXT (nullable) | Assigned opaque person ID (see Resolved Decision 1). NULL for film-only categories like Best Picture. |
| `film_name_raw` | TEXT | Film title as officially listed that year, for verification. |
| `person_name_raw` | TEXT (nullable) | Person's name as listed. |
| `won` | BOOLEAN | TRUE = winner. A tie is multiple TRUE rows in the same body/category/year. |
| `source_url` | TEXT | Where this record was verified. Provenance per row. |
| `notes` | TEXT | |

### `eligibility_exceptions`: documented non-comparable cases
Lets accuracy calculations exclude cases where a body *couldn't* have predicted
the Oscar, instead of counting them as misses. The clearest example is the WGA:
its eligibility rules periodically exclude major films entirely, so a WGA "miss"
in those years isn't a real predictive failure.

| Column | Type | Notes |
|--------|------|-------|
| `award_body_id` | TEXT (FK) | |
| `award_year` | INT | |
| `concept_category_id` | TEXT (FK) | |
| `exception_type` | TEXT | `ineligible_winner` (the eventual Oscar winner wasn't eligible at this body), `no_equivalent_category`, `disrupted_edition`, `other`. |
| `notes` | TEXT | E.g., "The King's Speech ineligible for WGA (2010); exclude from WGA adapted-screenplay accuracy." |

PK = (`award_body_id`, `award_year`, `concept_category_id`, `exception_type`)

### `forecasts`: forward-looking
Probabilistic forecasts from Gold Derby, Kalshi, and Polymarket. Kept separate
from the categorical awards data because it's timestamped, sparse, and mostly
collectible only going forward. It is not part of the v1 categorical dataset,
but the 2027 season will be captured into it (see [roadmap](roadmap.md), Stage 2).

| Column | Type | Notes |
|--------|------|-------|
| `forecast_id` | TEXT/INT (PK) | |
| `source_id` | TEXT | `gold_derby`, `kalshi`, `polymarket`. |
| `snapshot_date` | DATE | When the forecast was captured. Critical, because forecasts move. |
| `award_year` | INT | |
| `concept_category_id` | TEXT (FK) | |
| `film_key` | TEXT (nullable) | |
| `person_key` | TEXT (nullable) | |
| `probability` | REAL | 0–1. For markets, the implied probability. |
| `source_url` | TEXT | Provenance. |

---

## Match entity: how a "correct prediction" is defined

To compare a precursor winner with the Oscar winner, you have to know *what* you
are matching on. Each `concept_category` declares a `match_entity`:

- **`person`:** Best Director and the four acting categories only. A match
  means the same person won both.
- **`film`:** Best Picture, both screenplay categories, and every craft,
  technical, and other category added later. A screenplay can have several
  writers but belongs to exactly one film, so matching on the film is simpler
  and unambiguous (see Resolved Decision 2).

**Accuracy logic:** a body correctly predicted a concept in a given year if any of
its winning rows shares the relevant `match_entity` key with any of the Oscar's
winning rows for that concept. Rows flagged in `eligibility_exceptions` are
excluded.

Matching on stable keys rather than names is deliberate. The 2026 dashboard
matched on names and silently dropped a guild signal because two sources wrote
the same film differently ([`decisions.md`](decisions.md)).

---

## Known idiosyncrasies catalog

Each of these is handled by the schema above. This catalog documents *why* each
mechanism exists, and it will grow as collection turns up new edge cases.

**SAG → "Actor Awards" rebrand.** The Screen Actors Guild Awards became the
Actor Awards for `award_year` 2025 (the 2026 ceremony). Same `award_body_id`
(`sag`), plus a new `award_body_names` row with `valid_from_year = 2025`.
Analysis is unaffected because it joins on the stable ID.

**SAG Ensemble is a proxy, not an equivalent.** SAG's top film prize is
Outstanding Performance by a Cast. There is no Oscar for ensemble. It maps to
`best_picture` with `mapping_type = proxy`. Its historically weak hit rate is a
*finding*, not a data problem. Keeping `mapping_type` explicit lets any analysis
include or exclude proxies.

**Golden Globes splits lead acting and Best Picture into Drama and
Musical/Comedy.** Two body categories map to one concept with
`mapping_type = split`. The Globes count as correct if *either* split winner
matches the Oscar winner, which is how analysts actually reason about them.

**DGA, PGA, and SAG cover only some categories.** The DGA has only a feature
directing award (→ `best_director`). The PGA has only a top film award
(→ `best_picture`). SAG has the acting concepts plus ensemble. A body simply has
no `body_categories` row for concepts it doesn't award. Accuracy must be
computed per concept, never as one blended "body accuracy" number. Such a number
would be meaningless given the uneven coverage, and some published statistics
make exactly this error.

**WGA eligibility gaps.** WGA rules exclude films whose writers aren't covered
by the guild, so major Oscar screenplay winners are periodically ineligible.
Examples per industry reporting: The King's Speech (2010), The Artist (2011),
Birdman (2014), Nomadland (2020). These years get an `eligibility_exceptions`
row, so WGA accuracy is computed only over years when the Oscar winner *could*
have won the WGA.

**Best Foreign Language Film → Best International Feature Film.** Renamed for
`award_year` 2019. Stable `body_category_id`, with a new `body_category_names`
row from 2019.

**Best Casting is new (`award_year` 2025).** It was first awarded at the 2026
ceremony, with `active_from_year = 2025`. Any analysis has n = 1 and must be
flagged as non-inferential. This is the category the 2026 model missed because
there was no history.

**Ties.** Represented as multiple `won = TRUE` rows. A body counts as correct if
any tied winner matches. Examples: the 2009 Critics Choice Best Actress, and the
2026 Oscar for Live Action Short (*The Singers* and *Two People Exchanging
Saliva*).

**Disrupted editions (COVID).** The 2020 `award_year` cycle was heavily
disrupted, with ceremonies delayed into spring 2021 and eligibility windows
altered. These editions are flagged with `editions.disrupted = TRUE`, and
non-comparable categories get an `eligibility_exceptions` row, so every analysis
can run with and without them.

**Person vs. film credit in directing.** Occasionally the DGA and Oscar
directing credits differ (co-directors, for example). This is covered by
`match_entity = person` plus a documented tie-handling rule. Truly ambiguous
cases get a `notes` entry.

---

## v1 scope and collection order

**v1 target:**
- **Bodies:** `oscar`, `dga`, `pga`, `sag`, `wga`, `bafta`, `cca`, `gg` (8 total)
- **Concepts:** the "big eight": Picture, Director, the four acting categories,
  and both screenplays. These are the categories outside analyses actually
  cover, so self-computed numbers can be checked against published ones.
- **Years:** `award_year` 2000 to present. Twenty-five years gives stable rates
  and matches the window several published analyses use.
- **Winners only** to start, with the schema ready for full nominee slates.
- **Forecasts table:** deferred, apart from capturing snapshots going forward
  from the 2027 season.

**Collection order (added September 2026).** To produce usable results before the
full backfill is done, transcription runs in two passes:

1. **Pass 1a:** Oscar + DGA, PGA, SAG, WGA; big eight; `award_year` 2015–2025.
   This pass alone replaces the borrowed guild match rates the 2026 model used.
2. **Pass 1b:** add BAFTA, Critics Choice, and Golden Globes, and extend all
   bodies back to 2000.

**Transcription workflow.** Work outward from each precursor: start at a body's
`body_categories` row, enter that body's winners, and map inward to the concept
layer. Don't start from `concept_categories` and search outward for matching
awards. Working body by body keeps each source page open once and makes gaps
obvious.

Deliberately out of v1: craft, technical, and short-film categories (thin outside
validation, more naming churn), full nominee slates, and pre-2000 data.

---

## Why this design matters for the portfolio

Beyond enabling the accuracy analysis, the dataset demonstrates several skills:

- schema design with stable keys and slowly changing dimensions
- explicit handling of real-world messiness (renames, splits, proxies,
  eligibility gaps, ties)
- per-row provenance
- a documented method that makes every downstream number reproducible

Because it's extended every year, it keeps growing in value and gives the project
a recurring artifact to point to.

---

## Resolved design decisions

**1. Person identity: an opaque `person_key` for v1, and a full `persons`
dimension later.** For v1, an assigned `person_key` is enough for a small,
well-known population. A `persons` table is planned for a later version. Name
collisions are not the main reason. The main reason is that creatives change
their professional names over time, which disproportionately affects women and
queer creatives, and the dataset should track identity stably across those
changes. When it arrives, `persons` will follow the same slowly-changing-dimension
pattern as award bodies: a stable `person_id` plus a time-bounded
`person_names` history table.

- *Implication:* treat `person_key` as an ID you *assign*, not one derived from
  the current name. A slug of today's name would break if the person's name
  changes. Assigned keys survive the later migration untouched.

**2. Screenplay wins match on film, not writer.** A screenplay can have several
writers but belongs to exactly one film. Matching on the film is simpler and
unambiguous. This is a documented choice, not a hidden simplification.

**3. Primary sources, not pre-aggregated datasets.** Data is collected directly
so provenance is known and citable per row:

- **Oscar records:** the Academy's own database (search.oscars.org).
- **Precursor records** (DGA, PGA, SAG, WGA, BAFTA, CCA, GG): Wikipedia's
  per-ceremony pages, which are well structured and heavily cross-checked.

Rejecting a pre-aggregated dataset avoids inheriting undocumented cleaning
decisions, which is the whole reason to own the data. Inconsistent category names
across Wikipedia years are absorbed by the name-history tables.

**4. Excel for transcription → CSV as the source of truth → SQLite/pandas at
analysis time.** Excel is the entry surface. Flat CSVs, one per table, are the
canonical, Git-diffable record. Relational structure is built at analysis time,
not baked into storage.

- *Implication:* guard against Excel's silent reformatting. It turns
  `award_year` and anything date-like into date serials, and it mangles leading
  zeros and accented characters (Göransson, Skarsgård). Format every column as
  Text before entering data, and run a validation step before each CSV commit.
  That step confirms `award_year` exports as a plain integer and titles keep
  their exact original characters.
