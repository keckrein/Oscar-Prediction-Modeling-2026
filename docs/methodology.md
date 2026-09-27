# Methodology

## What the model is

A hand-weighted ensemble that turns three published probability sources into a
single probability for each nominee in each of the 24 Oscar categories, with a
small adjustment for guild precursor results. The model's pick is the
highest-probability nominee. Everything is computed in the browser from a frozen
snapshot of ceremony-day data (March 15, 2026, 3:30 pm ET). There is no live
feed and no server.

The whole calculation is about 30 lines of JavaScript in
[`src/oscars2026.jsx`](../src/oscars2026.jsx) (`computeEnsemble`). This document
describes what it does, why, and where it is weak.

## Pipeline

For each category:

1. **Collect** each source's probabilities for its listed nominees (sources list
   their top 3–4).
2. **Weight-average** the three sources using the weight set for that category's
   group.
3. **Adjust for the guild precursor**, if one exists, by blending the guild
   winner's score toward that guild's historical match rate.
4. **Renormalize** so the listed nominees sum to 100%, and round to whole
   percentages.
5. **Pick** the top nominee.

## Inputs

### Probability sources (in the ensemble)

| Source | What it is | Industry-cited accuracy used to set weights |
|---|---|---|
| **Gold Derby** | Aggregated expert and crowd predictions | ~82% |
| **Kalshi** | US-regulated real-money prediction market | ~78% |
| **Polymarket** | Decentralized prediction market | ~67% |

The accuracy figures are commonly cited, approximate rates. I did not compute
them from data I own, and their time windows and counting rules are unknown.
They were a reasonable starting point for hand-set weights. They are not
validated inputs. Replacing borrowed figures like these with ones computed from
a documented dataset is the first stage of the [roadmap](roadmap.md).

### Guild precursors (adjustment, not a full source)

| Guild | Oscar category | Industry-cited match rate |
|---|---|---|
| DGA (Directors Guild) | Director | ~90% |
| PGA (Producers Guild) | Picture | ~72% |
| SAG (Actor Awards) | All four acting categories | ~68% |
| WGA (Writers Guild) | Both screenplay categories | ~62% |

### Tracked, but deliberately excluded

| Source | Why it's shown | Why it's excluded |
|---|---|---|
| **Variety / Clayton Davis** final picks (Mar 12) | A widely read editorial forecast; its disagreements with the model are flagged | A single pundit's narrative read belongs in interpretation, not mechanical weighting. See [`decisions.md`](decisions.md). |
| **NPR Pop Culture Happy Hour** hosts' "will win" picks (Mar 13, 6 categories) | A comparison point from informed critics | Same reasoning. They also covered only 6 of 24 categories. |

## Step 2: source weights

Weights are `[Gold Derby, Kalshi, Polymarket]` and sum to 1 within each group.

| Weight group | Categories | Gold Derby | Kalshi | Polymarket |
|---|---|---|---|---|
| Acting | Actor, Actress, Supporting Actor, Supporting Actress | 0.40 | 0.35 | 0.25 |
| Picture | Best Picture | 0.38 | 0.37 | 0.25 |
| Director | Best Director | 0.42 | 0.33 | 0.25 |
| Screenplay | Original, Adapted | 0.45 | 0.32 | 0.23 |
| Craft, feature & technical | Animated Feature, International Feature, Documentary Feature, Cinematography, Editing, Score, Song, Production Design, Costume, Makeup & Hairstyling, Sound, Visual Effects, Casting (13) | 0.50 | 0.30 | 0.20 |
| Shorts | Documentary Short, Live Action Short, Animated Short | 0.55 | 0.25 | 0.20 |

**The reasoning behind the pattern:** Gold Derby gets the largest share
everywhere, because it had the highest cited accuracy. Its share grows as
categories become lower-profile, because prediction-market liquidity (and with it
the information in the price) thins out in craft and short-film categories. The
expert panel's coverage does not thin out the same way. Polymarket, with the
lowest cited accuracy, gets the smallest share in every group.

These weights were set by judgment, not fitted to past results. The 2026
scorecard ([`results.md`](results.md)) found that they performed about the
same as equal weights. One year can't tell whether that's because the weights
are wrong or because the sources are nearly interchangeable.

## Step 3: guild precursor adjustment

If a category has a guild precursor and the guild winner appears among the
listed nominees, that nominee's weighted score `s` becomes:

```
s' = 0.75 × s + 0.25 × (guild match rate × 100)
```

All other nominees keep their scores, and the category is then renormalized
(step 4).

**A property of this design that matters more than the formula:** it pulls the
guild winner *toward the guild's historical match rate*, not upward. If the
markets already rate the guild winner above that rate, the adjustment lowers
that nominee's probability slightly. In 2026 this happened with Sean Penn:
the SAG win moved him from 75% to 74%. It happened with Sinners in Original
Screenplay too: 95% to 94%. Across all eight precursor categories, the
adjustment moved the winner's probability by at most one point. By ceremony
day, the markets and Gold Derby had already absorbed the guild results. So
the adjustment was close to a no-op. That is a small, one-year hint of the
redundancy the v2 information audit is designed to measure properly.

## Step 4: renormalization

Sources list only their top three or four nominees, so the ensemble renormalizes
across the listed names. Unlisted nominees are treated as 0%. This slightly
overstates the listed nominees' probabilities. The 2026 Animated Short miss shows
the cost: the winner wasn't listed by any source, so the model gave it 0%.

## Name matching

Sources label the same nominee differently ("Sinners" vs. "Sinners (Coogler)").
`fuzzyMatch` lowercases, strips punctuation, and treats two names as the same if
either contains the other's first 10 characters. This is simple and worked for
this ballot, but it can fail silently. It did once on ceremony day: the WGA
Original Screenplay winner was stored as "Sinners (Ryan Coogler)", which never
matched. See [`decisions.md`](decisions.md). A production version would use
stable nominee IDs, which is how the historical dataset is designed
([`historical-dataset-schema.md`](historical-dataset-schema.md)).

## How results are graded

Added after the ceremony. The same code grades every source on the same
24 categories.

- **Top-pick accuracy:** did the highest-probability nominee win?
- **Average probability on the winner:** the probability each source gave the
  eventual winner, averaged over 24 categories. It rewards confidence in the
  right answer.
- **Brier score** (lower is better). For each category:
  `Σ (forecast probability − outcome)²`, summed over every nominee any source
  listed, plus the actual winner. Then averaged across categories. Every source is
  scored on the same nominee set, and a nominee a source didn't list counts as
  0%. This is the multi-outcome form of the Brier score. It is not directly
  comparable to the binary Brier scores in other projects.
- **Ties:** Live Action Short was a two-way tie. Picking either winner counts as
  correct, and probability on either winner counts toward "probability on the
  winner."

## Known limitations

- **Hand-set weights.** They were never back-tested. See [`roadmap.md`](roadmap.md).
- **Correlated inputs treated as independent.** Gold Derby's experts, both
  markets, and the guild results all react to one another, so three sources
  agreeing is less evidence than it looks.
- **Borrowed accuracy figures.** Every accuracy rate above is industry-cited, not
  self-computed.
- **No special handling for new or low-signal categories.** The model passed the
  markets' 88–89% confidence in Best Casting straight through, in the category's
  first-ever year.
- **Truncated nominee lists.** See step 4.
- **One cycle.** Nothing here can be validated on 24 outcomes from a single year.
