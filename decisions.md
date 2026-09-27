# Decisions & build log

This log covers the judgment calls behind the model. That means what went in, what
stayed out, and what went wrong. It also covers the corrections made when I
reviewed the project for publication in September 2026. The thinking recorded
here, not the code, is what the project is meant to show.

---

## Part 1: Decisions made during the 2026 season

### Three probability sources, chosen deliberately

The ensemble blends Gold Derby, Kalshi, and Polymarket. All three publish a
probability for every nominee, which is what a weighted average needs. The
prediction markets were included because real-money prices aggregate
information from many participants. They were also treated with suspicion.
Markets and expert panels read the same news and each other, so their
agreement overstates the evidence. That concern became the central question
of the follow-on project ([`roadmap.md`](roadmap.md)).

### Inputs researched and rejected

- **Critic scores and audience ratings (IMDb, Letterboxd, aggregate review
  scores).** I concluded they have no winner-predictive value beyond a threshold
  effect. Being well-reviewed helps a film get nominated, but among nominees it
  doesn't separate the winner. They were left out rather than added as noise.
- **Ben Zauzmer's Oscarmetrics.** I identified it as probably the strongest
  available statistical source, but didn't integrate it before the ceremony.
  It is flagged here as future work rather than quietly omitted.

### Qualitative voices tracked, not weighted

Variety's Clayton Davis (final picks, March 12) and the four NPR Pop Culture
Happy Hour hosts (March 13 episode) appear on the dashboard but never enter the
calculation. The reasoning: a critic's or pundit's call mixes a forecast with a
narrative read. That belongs in interpretation alongside the model, not inside
it as a mechanical weight. Variety was added mid-season with a flag that
highlights where its pick differs from the model's. That made the disagreements
easy to see without letting them move the numbers.

How it played out is in [`results.md`](results.md). Variety differed from the
ensemble in five categories and was right in one. That one was Documentary
Feature, a category the model missed.

### Category-specific weights

Rather than one weight set for all 24 categories, weights vary across six groups.
Gold Derby's share rises from 0.40 in acting to 0.55 in the shorts, where market
liquidity is thin. This was a reasoned hypothesis, not a fitted result. Testing it
against a single global weight set is research question Q2 in the roadmap.

### Guild precursors as a fixed-factor adjustment

For the eight categories with a matching guild award (DGA, PGA, SAG, WGA), the
guild winner's score is blended 75/25 toward that guild's historical match rate.
This was a pragmatic stand-in for a real model of how much a precursor adds. In
practice, by ceremony day, the markets had already priced in the guild results.
So the adjustment moved no category by more than a point
([`methodology.md`](methodology.md#step-3-guild-precursor-adjustment)).

### Frozen snapshots, not live API calls

The dashboard runs on hand-entered, timestamped snapshots rather than calling
market APIs. The forecasting value was in the pre-ceremony consensus. Live odds
during the broadcast only react to winners already announced. Live fetching
would have added failure points with no forecasting benefit.

### Separating information from noise after ballots closed

Final Oscar voting closed several days before the ceremony. When the Best Actor
market swung on a candidate's bad press *after* voting had closed, I didn't
update the model to follow it. News that arrives after the votes are cast can't
change them, so that move was traders reacting to headlines, not new
information about the outcome.

### Going back to the primary source

The Pop Culture Happy Hour picks were first entered from a secondhand written
summary. Re-deriving them from the full episode transcript fixed a misattributed
pick and recovered several categories the summary had dropped. Trusting the
summary would have put wrong data on the dashboard.

---

## Part 2: What the ceremony taught

**New categories need their own rule.** Best Casting was awarded for the first
time in 2026. The markets were 88–89% confident in Sinners. One Battle After
Another won. With no history, that confidence had nothing behind it, and the
model passed it straight through. A future version should flag any category
without a historical base rate and widen its uncertainty. Best Casting is also
excluded from the v2 analysis, since one year of data can't support inference.

**Some misses are not tuning errors.** In all four misses, every source had the
same wrong nominee on top, so no reweighting could have changed a pick.
Documentary Feature was a low-confidence call (54%) that went the other way. The
other three had no signal for the winner in any source: Cinematography (a
historic first), Casting (no base rate), and Animated Short (the winner wasn't
in any source's top three). Keeping "the model was mistuned" separate from
"the signal wasn't there" is the most useful lesson of the post-mortem.

---

## Part 3: Portfolio review corrections (September 2026)

Before publishing, I re-derived every number in the write-up from the
dashboard's own data and checked the precursor inputs against the guilds'
announced results. Nothing below changes any of the model's 24 picks or the
20/24 result. Several findings do change how the result should be described.

### Data error: WGA Adapted Screenplay winner was wrong

- **What was wrong:** the precursor table listed *Hamnet* as the WGA Adapted
  Screenplay winner. The WGA announced *One Battle After Another* on March 8,
  2026, a week before the ceremony-day snapshot. This was a data-entry error, not
  missing information.
- **Effect on ceremony day:** the adjustment pulled probability toward the wrong
  film. The dashboard showed One Battle After Another at **82%** and Hamnet at
  **17%**. Corrected, they are **93%** and **6%**. The pick (One Battle After
  Another) was right either way.
- **Fix:** corrected in `PRECURSORS`, with a comment pointing here.

### Silent bug: WGA Original Screenplay signal never applied

- **What was wrong:** the winner was stored as "Sinners (Ryan Coogler)". Every
  probability source used "Sinners (Coogler)". The name matcher compares the
  first 10 normalized characters ("sinnersrya" vs. "sinnerscoo"), so it never
  linked them. The WGA badge still showed on the card, but the adjustment was
  silently skipped.
- **Effect:** the dashboard showed Sinners at 95%. With the signal applied, it's
  94%. Same pick.
- **Why it matters beyond this case:** the failure produced no error, just a
  quietly different number. That is the argument for stable IDs over name
  matching, which the historical dataset schema adopts.

### Effect of both precursor fixes on the scorecard

| | As run on ceremony day | Corrected (what the dashboard now shows) |
|---|---|---|
| Top picks correct | 20/24 | 20/24 |
| Avg. probability on winner | 69.0% | 69.4% |
| Brier score | 0.309 | 0.307 |
| Guild precursors' own record | 6/8 as entered | 8/8 |

The guilds' "6/8 as entered" is an artifact of the two data problems above, not
a real guild miss. All eight 2026 guild winners went on to win the Oscar.

### Claims in the original write-up that didn't hold up

| Original claim | What the data shows |
|---|---|
| "Following Gold Derby alone would likely have scored 18–19." | Gold Derby alone: **19/24**. More important, **Kalshi alone and Polymarket alone each scored 20/24**, the same as the ensemble. |
| "The ensemble's marginal contribution was modest." | On top picks it was **zero**. On probability-based scoring the ensemble was best on Brier score (0.307 vs. 0.312–0.314) and second of four on average probability on the winner (behind Polymarket). All differences are within noise. |
| Variety "diverged from the model on two major categories and went 0-for-2." | Variety differed in **five** categories (Picture, Director, Supporting Actor, Documentary Feature, Animated Short) and was right in **one** (Documentary Feature). On the three major categories it went 0-for-3. |
| Cinematography: "All three sources agreed on One Battle (~77%)." | All three had One Battle on top, but Gold Derby was at **55%**. Only the markets were at 77%. The ensemble was at **67%**. |
| Documentary Feature was "a genuine coin-flip." | The ensemble had the eventual winner a clear second, **54% vs. 36%**. That's a real but unfavored chance, not a coin-flip. |
| Weighting rationale: "expert consensus is stronger in acting categories." | The weights say the opposite: Gold Derby's share is *lowest* in acting (0.40) and highest in shorts (0.55). The rationale was restated to match the code. |
| Precursor accuracy figures cited as "past 6 years." | Their source window is unknown. They are now labeled "industry-cited" everywhere. |

### Undocumented fact: Live Action Short was a tie

*The Singers* and *Two People Exchanging Saliva* tied. The model picked
*Two People Exchanging Saliva*, so it counts as correct. Gold Derby picked
*A Friend of Dorothy*, which is its one extra miss relative to the markets. The
grading rule (either tied winner counts) is now explicit in the code and docs.

### Dashboard changes for publication

- **Added a results view:** actual winners, a hit/miss on every card, winner tags
  on each source's bars, post-mortem notes on the four misses, and a scorecard
  that grades the ensemble against each input *computed from the data in the
  file*, not typed in.
- **"Contested" filter is now data-driven** (ensemble top pick under 60%). It was
  a hand-picked list that included Best Original Score, where the ensemble was at
  90%.
- **The Variety flag now compares against the ensemble's pick** rather than
  Gold Derby's. The README's claims are about disagreement with the model.
- **Rewrote the header notes.** The Pop Culture Happy Hour summary misattributed
  the Best Actor split (it omitted Aisha's Chalamet pick). Ceremony-day market
  figures are now computed from the data. An unverifiable trading-volume figure
  was removed, along with working notes to myself.
- **Methodology panel** now shows the full weight table and describes the
  weighting logic correctly.
- **Official category names** (e.g., "Best International Feature" rather than
  "Best International Film").
- **Unchanged:** every Gold Derby, Kalshi, Polymarket, Variety, and Pop Culture
  Happy Hour data point is byte-for-byte the ceremony-day snapshot.
