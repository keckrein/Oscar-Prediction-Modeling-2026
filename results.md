# Results

The forecast is a frozen ceremony-day snapshot (March 15, 2026, 3:30 pm ET),
graded against the winners announced that night. All figures below reflect the
corrected precursor data described in [`decisions.md`](decisions.md#part-3-portfolio-review-corrections-september-2026).
Those corrections changed no pick. The dashboard's results view computes every
number here from the data in `src/oscars2026.jsx`.

## Headline

**20 of 24 categories correct (83%)**, including every major category:
Picture, Director, all four acting awards, and both screenplays.

## Scorecard: the ensemble vs. each of its inputs

The question a blended model has to answer is whether blending beat simply
following the best single source.

| Forecast | Top pick correct | Avg. probability on winner | Brier score (lower = better) |
|---|---|---|---|
| **Weighted ensemble (this model)** | **20/24** | 69.4% | **0.307** |
| Kalshi alone | 20/24 | 69.2% | 0.314 |
| Polymarket alone | 20/24 | 69.7% | 0.312 |
| Gold Derby alone | 19/24 | 66.3% | 0.313 |

**What this means:** the ensemble tied both prediction markets on top
picks. It had the best Brier score and the second-best probability on the winner.
The spreads are tiny: 0.007 in Brier score, 3.4 points in probability on the
winner. With 24 outcomes from one ceremony, they are not meaningful. The fair
conclusion is that **the ensemble matched its inputs but did not demonstrably
beat them.** A single cycle can't say more. That is the reason for the
multi-year back-test in the [roadmap](roadmap.md).

### Did the hand-tuned weights or the guild adjustment help?

The same data under simpler rules:

| Variant | Top pick correct | Avg. probability on winner | Brier score |
|---|---|---|---|
| Shipped model (hand weights + guild adjustment) | 20/24 | 69.4% | 0.307 |
| Hand weights, no guild adjustment | 20/24 | 69.5% | 0.307 |
| Equal weights + guild adjustment | 20/24 | 69.9% | 0.308 |
| Equal weights, no guild adjustment | 20/24 | 69.8% | 0.309 |
| Markets only (Kalshi/Polymarket 50/50) | 20/24 | 70.8% | 0.310 |

Every variant picks the same 20 winners. The guild adjustment changed no
category's winner probability by more than one point. By ceremony day the
markets had already priced in the guild results. Whether precursors carry any
signal the markets haven't already absorbed is exactly question Q0 of the
roadmap. This one year hints that they may not, at least by ceremony day.

## Pick-only sources (not in the ensemble)

| Source | Record | Ensemble on the same categories |
|---|---|---|
| Guild precursors (DGA, PGA, SAG ×4, WGA ×2) | 8/8 | 8/8 |
| Variety / Clayton Davis final picks | 18/24 | 20/24 |
| Pop Culture Happy Hour: Linda / Stephen / Glen / Aisha | 3 / 2 / 4 / 3 of 6 | 6/6 |

Variety's picks differed from the ensemble in five categories: Picture,
Director, Supporting Actor, Documentary Feature, and Animated Short. Variety was
right in one of them, Documentary Feature, which the ensemble missed.

The guilds went 8/8. That fits the ~62–90% historical match rates cited for
them, but a single perfect year doesn't validate those rates. Computing them
properly across 2000–2025 is stage 1 of the roadmap.

## Accuracy by the ensemble's own confidence

| Ensemble confidence in its pick | Correct | Categories |
|---|---|---|
| 85% or higher | 9 of 10 | the miss: Casting (86%) |
| 70–84% | 7 of 7 | |
| Below 70% | 4 of 7 | misses: Documentary Feature (54%), Animated Short (51%), Cinematography (67%) |

Higher confidence went with higher accuracy, which is the direction a
calibrated forecast should show. With 7–10 categories per bucket, this is a
sanity check, not a calibration test. The one high-confidence miss was the
brand-new Casting category.

## All 24 categories

| Category | Ensemble pick | Ensemble % | Winner | Result | Ensemble % on winner |
|---|---|---|---|---|---|
| Best Picture | One Battle After Another | 77% | One Battle After Another | ✓ | 77% |
| Best Director | Paul Thomas Anderson | 93% | Paul Thomas Anderson | ✓ | 93% |
| Best Actor | Michael B. Jordan | 60% | Michael B. Jordan | ✓ | 60% |
| Best Actress | Jessie Buckley | 97% | Jessie Buckley | ✓ | 97% |
| Best Supporting Actor | Sean Penn | 74% | Sean Penn | ✓ | 74% |
| Best Supporting Actress | Amy Madigan | 59% | Amy Madigan | ✓ | 59% |
| Best Animated Feature | KPop Demon Hunters | 90% | KPop Demon Hunters | ✓ | 90% |
| Best International Feature | Sentimental Value | 61% | Sentimental Value | ✓ | 61% |
| Best Documentary Feature | The Perfect Neighbor | 54% | Mr. Nobody Against Putin | ✗ | 36% |
| Best Documentary Short | All the Empty Rooms | 71% | All the Empty Rooms | ✓ | 71% |
| Best Live Action Short | Two People Exchanging Saliva | 41% | The Singers / Two People Exchanging Saliva (tie) | ✓ | 41% + 22% |
| Best Animated Short | Butterfly (Papillon) | 51% | The Girl Who Cried Pearls | ✗ | 0% (not listed) |
| Best Original Screenplay | Sinners | 94% | Sinners | ✓ | 94% |
| Best Adapted Screenplay | One Battle After Another | 93% | One Battle After Another | ✓ | 93% |
| Best Cinematography | One Battle After Another | 67% | Sinners | ✗ | 27% |
| Best Film Editing | One Battle After Another | 78% | One Battle After Another | ✓ | 78% |
| Best Original Score | Sinners | 90% | Sinners | ✓ | 90% |
| Best Original Song | "Golden" (KPop Demon Hunters) | 85% | "Golden" | ✓ | 85% |
| Best Production Design | Frankenstein | 86% | Frankenstein | ✓ | 86% |
| Best Costume Design | Frankenstein | 82% | Frankenstein | ✓ | 82% |
| Best Makeup & Hairstyling | Frankenstein | 90% | Frankenstein | ✓ | 90% |
| Best Sound | F1 | 76% | F1 | ✓ | 76% |
| Best Visual Effects | Avatar: Fire and Ash | 79% | Avatar: Fire and Ash | ✓ | 79% |
| Best Casting | Sinners | 86% | One Battle After Another | ✗ | 5% |

## The four misses

| Category | Model | Winner | What happened |
|---|---|---|---|
| Cinematography | One Battle After Another (67%) | Sinners (27%) | All three sources had One Battle on top (Gold Derby 55%, both markets 77%). Autumn Durald Arkapaw became the first woman to win the category. The quantitative inputs carried no signal for that historic-first story. |
| Documentary Feature | The Perfect Neighbor (54%) | Mr. Nobody Against Putin (36%) | A low-confidence pick with the winner a clear second. The model's own probabilities allowed for this miss. |
| Casting | Sinners (86%) | One Battle After Another (5%) | First year of the category, with no historical base rate. The markets' 88–89% confidence was false precision, and the model passed it through. |
| Animated Short | Butterfly (Papillon) (51%) | The Girl Who Cried Pearls (0%) | The winner was outside every source's top three. Structurally low-signal category. |

In all four misses, Gold Derby, Kalshi, and Polymarket all had the same wrong
nominee on top, so no weighting of these three sources could have changed the
pick. Documentary Feature was a low-confidence call that went the other way.
The other three (Cinematography, Casting, Animated Short) had no signal for the
winner in any source.

## Scoring definitions

Full definitions are in [`methodology.md`](methodology.md#how-results-are-graded).
In brief:

- The Brier score is the multi-outcome version, summed over nominees within a
  category and averaged across the 24 categories.
- Every source is scored on the same nominee set.
- An unlisted nominee counts as 0%.
- Either winner of a tie counts.

## Winner sources

Winners were verified against published lists from
[PBS NewsHour](https://www.pbs.org/newshour/arts/heres-a-full-list-of-2026-academy-awards-winners)
and [Al Jazeera](https://www.aljazeera.com/news/2026/3/16/oscars-2026-full-list-of-winners).
The WGA screenplay winners come from the
[WGA East announcement](https://www.wgaeast.org/2026-writers-guild-awards-winners-announced/).
