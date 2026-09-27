import { useState } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// Oscar Prediction Ensemble — 98th Academy Awards (March 15, 2026)
//
// A weighted ensemble of three probability sources (Gold Derby, Kalshi,
// Polymarket) plus guild precursor signals, run live on ceremony day.
// All forecast data below is a frozen snapshot from ceremony day. It is not a
// live feed. The ACTUAL_WINNERS block was added after the ceremony so the
// dashboard can grade its own forecast.
//
// See docs/methodology.md for how the ensemble works, docs/results.md for the
// full scorecard, and docs/decisions.md for the build log and corrections.
// ═══════════════════════════════════════════════════════════════════════════

// ─── SNAPSHOT TIMESTAMP ─────────────────────────────────────────────────────
const DATA_DATE = "March 15, 2026 (ceremony day, 3:30 pm ET)";

// ─── SOURCE WEIGHTS: [Gold Derby, Kalshi, Polymarket] ───────────────────────
// Set by hand, not optimized. The starting point was industry-cited historical
// accuracy (Gold Derby ~82%, Kalshi ~78%, Polymarket ~67%). Gold Derby's share
// rises from 0.40 to 0.55 as categories get lower-profile, on the reasoning that
// prediction-market liquidity thins out there while the expert panel does not.
// Whether these weights beat equal weighting is exactly what the v2 roadmap
// tests (docs/roadmap.md).
const SOURCE_WEIGHTS = {
  major_acting:  [0.40, 0.35, 0.25],
  best_picture:  [0.38, 0.37, 0.25],
  best_director: [0.42, 0.33, 0.25],
  screenplay:    [0.45, 0.32, 0.23],
  technical:     [0.50, 0.30, 0.20],
  shorts:        [0.55, 0.25, 0.20],
};

const CAT_WEIGHT_GROUP = {
  best_picture:"best_picture", best_director:"best_director",
  best_actor:"major_acting", best_actress:"major_acting",
  best_supp_actor:"major_acting", best_supp_actress:"major_acting",
  best_animated:"technical", best_intl:"technical", best_documentary:"technical",
  best_doc_short:"shorts", best_live_action_short:"shorts", best_animated_short:"shorts",
  best_orig_screenplay:"screenplay", best_adapt_screenplay:"screenplay",
  best_cinematography:"technical", best_editing:"technical", best_score:"technical",
  best_song:"technical", best_production:"technical", best_costume:"technical",
  best_makeup:"technical", best_sound:"technical", best_vfx:"technical", best_casting:"technical",
};

// ─── GUILD PRECURSORS ───────────────────────────────────────────────────────
// `accuracy` = approximate historical rate at which this guild's winner went on
// to win the matching Oscar, as commonly cited in industry reporting. These
// are borrowed figures, not computed from a dataset I own. Replacing them
// with self-computed rates is the first stage of the roadmap.
//
// Corrected September 2026 (see docs/decisions.md):
//   • Original Screenplay: the name was stored as "Sinners (Ryan Coogler)", which
//     the name matcher never linked to "Sinners (Coogler)". The WGA signal was
//     silently dropped for this category on ceremony day.
//   • Adapted Screenplay: entered as "Hamnet". The actual WGA winner (March 8,
//     2026) was One Battle After Another.
// Neither correction changes any top pick. Both change screenplay probabilities.
const PRECURSORS = {
  best_picture:          { winner:"One Battle After Another", source:"PGA", accuracy:72 },
  best_director:         { winner:"Paul Thomas Anderson",     source:"DGA", accuracy:90 },
  best_actor:            { winner:"Michael B. Jordan",        source:"SAG", accuracy:68 },
  best_actress:          { winner:"Jessie Buckley",           source:"SAG", accuracy:68 },
  best_supp_actor:       { winner:"Sean Penn",                source:"SAG", accuracy:68 },
  best_supp_actress:     { winner:"Amy Madigan",              source:"SAG", accuracy:68 },
  best_orig_screenplay:  { winner:"Sinners (Coogler)",        source:"WGA", accuracy:62 },
  best_adapt_screenplay: { winner:"One Battle After Another", source:"WGA", accuracy:62 },
};

// ─── GOLD DERBY DATA (March 15, 2026 — ceremony day final) ───────────────────
const GD = {
  best_picture:           [{n:"One Battle After Another",p:76},{n:"Sinners",p:21},{n:"Hamnet",p:2},{n:"Marty Supreme",p:1}],
  best_director:          [{n:"Paul Thomas Anderson",p:94},{n:"Ryan Coogler",p:5},{n:"Chloé Zhao",p:1}],
  best_actor:             [{n:"Michael B. Jordan",p:56},{n:"Timothée Chalamet",p:28},{n:"Leonardo DiCaprio",p:10},{n:"Ethan Hawke",p:5}],
  best_actress:           [{n:"Jessie Buckley",p:97},{n:"Rose Byrne",p:2},{n:"Kate Hudson",p:1}],
  best_supp_actor:        [{n:"Sean Penn",p:68},{n:"Delroy Lindo",p:18},{n:"Stellan Skarsgård",p:10},{n:"Jacob Elordi",p:3}],
  best_supp_actress:      [{n:"Amy Madigan",p:54},{n:"Teyana Taylor",p:26},{n:"Wunmi Mosaku",p:16}],
  best_animated:          [{n:"KPop Demon Hunters",p:85},{n:"Zootopia 2",p:10},{n:"Elio",p:4}],
  best_intl:              [{n:"Sentimental Value",p:55},{n:"The Secret Agent",p:30},{n:"It Was Just an Accident",p:10}],
  best_documentary:       [{n:"The Perfect Neighbor",p:48},{n:"Mr. Nobody Against Putin",p:32},{n:"Come See Me in the Good Light",p:12}],
  best_doc_short:         [{n:"All the Empty Rooms",p:65},{n:"The Devil Is Busy",p:18},{n:"Armed Only with a Camera",p:10}],
  best_live_action_short: [{n:"A Friend of Dorothy",p:38},{n:"Two People Exchanging Saliva",p:32},{n:"The Singers",p:18}],
  best_animated_short:    [{n:"Butterfly (Papillon)",p:45},{n:"Retirement Plan",p:33},{n:"Forevergreen",p:12}],
  best_orig_screenplay:   [{n:"Sinners (Coogler)",p:92},{n:"Sentimental Value",p:5},{n:"Marty Supreme",p:2}],
  best_adapt_screenplay:  [{n:"One Battle After Another",p:90},{n:"Hamnet",p:8},{n:"Train Dreams",p:2}],
  best_cinematography:    [{n:"One Battle After Another",p:55},{n:"Sinners",p:35},{n:"Train Dreams",p:7},{n:"Marty Supreme",p:2}],
  best_editing:           [{n:"One Battle After Another",p:72},{n:"Sinners",p:20},{n:"Marty Supreme",p:6}],
  best_score:             [{n:"Sinners (Göransson)",p:88},{n:"One Battle After Another",p:8},{n:"Hamnet",p:3}],
  best_song:              [{n:'"Golden" – KPop DH',p:82},{n:'"I Lied to You" – Sinners',p:12},{n:'"Train Dreams"',p:4}],
  best_production:        [{n:"Frankenstein",p:80},{n:"Sinners",p:10},{n:"Hamnet",p:6}],
  best_costume:           [{n:"Frankenstein",p:78},{n:"Sinners",p:14},{n:"Hamnet",p:5}],
  best_makeup:            [{n:"Frankenstein",p:88},{n:"Sinners",p:8},{n:"The Smashing Machine",p:3}],
  best_sound:             [{n:"F1",p:72},{n:"Sinners",p:18},{n:"Avatar: Fire and Ash",p:7}],
  best_vfx:               [{n:"Avatar: Fire and Ash",p:75},{n:"Sinners",p:14},{n:"F1",p:8}],
  best_casting:           [{n:"Sinners",p:82},{n:"Marty Supreme",p:10},{n:"One Battle After Another",p:6}],
};

// ─── KALSHI DATA (March 15, 2026 — 3:30pm ET ceremony day live) ──────────────
const KALSHI = {
  best_picture:           [{n:"One Battle After Another",p:77},{n:"Sinners",p:20},{n:"Hamnet",p:2},{n:"Marty Supreme",p:1}],
  best_director:          [{n:"Paul Thomas Anderson",p:93},{n:"Ryan Coogler",p:6},{n:"Chloé Zhao",p:1}],
  best_actor:             [{n:"Michael B. Jordan",p:61},{n:"Timothée Chalamet",p:30},{n:"Leonardo DiCaprio",p:6},{n:"Ethan Hawke",p:2}],
  best_actress:           [{n:"Jessie Buckley",p:96},{n:"Kate Hudson",p:2},{n:"Rose Byrne",p:1}],
  best_supp_actor:        [{n:"Sean Penn",p:77},{n:"Stellan Skarsgård",p:15},{n:"Delroy Lindo",p:5},{n:"Jacob Elordi",p:2}],
  best_supp_actress:      [{n:"Amy Madigan",p:57},{n:"Teyana Taylor",p:24},{n:"Wunmi Mosaku",p:16}],
  best_animated:          [{n:"KPop Demon Hunters",p:94},{n:"Zootopia 2",p:4},{n:"Elio",p:1}],
  best_intl:              [{n:"Sentimental Value",p:60},{n:"The Secret Agent",p:28},{n:"It Was Just an Accident",p:8}],
  best_documentary:       [{n:"The Perfect Neighbor",p:52},{n:"Mr. Nobody Against Putin",p:36},{n:"Come See Me in the Good Light",p:8}],
  best_doc_short:         [{n:"All the Empty Rooms",p:70},{n:"The Devil Is Busy",p:18},{n:"Armed Only with a Camera",p:8}],
  best_live_action_short: [{n:"Two People Exchanging Saliva",p:42},{n:"A Friend of Dorothy",p:28},{n:"The Singers",p:20}],
  best_animated_short:    [{n:"Butterfly (Papillon)",p:48},{n:"Retirement Plan",p:32},{n:"Forevergreen",p:12}],
  best_orig_screenplay:   [{n:"Sinners (Coogler)",p:95},{n:"Sentimental Value",p:3},{n:"Marty Supreme",p:1}],
  best_adapt_screenplay:  [{n:"One Battle After Another",p:96},{n:"Hamnet",p:3},{n:"Train Dreams",p:1}],
  best_cinematography:    [{n:"One Battle After Another",p:77},{n:"Sinners",p:18},{n:"Train Dreams",p:4}],
  best_editing:           [{n:"One Battle After Another",p:80},{n:"Sinners",p:15},{n:"Marty Supreme",p:4}],
  best_score:             [{n:"Sinners (Göransson)",p:90},{n:"One Battle After Another",p:7},{n:"Hamnet",p:2}],
  best_song:              [{n:'"Golden" – KPop DH',p:85},{n:'"I Lied to You" – Sinners',p:10},{n:'"Train Dreams"',p:3}],
  best_production:        [{n:"Frankenstein",p:85},{n:"Sinners",p:8},{n:"Hamnet",p:4}],
  best_costume:           [{n:"Frankenstein",p:82},{n:"Sinners",p:12},{n:"Hamnet",p:4}],
  best_makeup:            [{n:"Frankenstein",p:90},{n:"Sinners",p:7},{n:"The Smashing Machine",p:2}],
  best_sound:             [{n:"F1",p:75},{n:"Sinners",p:16},{n:"Avatar: Fire and Ash",p:6}],
  best_vfx:               [{n:"Avatar: Fire and Ash",p:78},{n:"Sinners",p:13},{n:"F1",p:7}],
  best_casting:           [{n:"Sinners",p:88},{n:"Marty Supreme",p:8},{n:"One Battle After Another",p:3}],
};

// ─── POLYMARKET DATA (March 15, 2026 — 3:30pm ET ceremony day live) ──────────
const POLY = {
  best_picture:           [{n:"One Battle After Another",p:79},{n:"Sinners",p:18},{n:"Hamnet",p:2},{n:"Marty Supreme",p:1}],
  best_director:          [{n:"Paul Thomas Anderson",p:92},{n:"Ryan Coogler",p:7},{n:"Chloé Zhao",p:1}],
  best_actor:             [{n:"Michael B. Jordan",p:61},{n:"Timothée Chalamet",p:30},{n:"Leonardo DiCaprio",p:6},{n:"Ethan Hawke",p:2}],
  best_actress:           [{n:"Jessie Buckley",p:97},{n:"Kate Hudson",p:2},{n:"Rose Byrne",p:1}],
  best_supp_actor:        [{n:"Sean Penn",p:79},{n:"Stellan Skarsgård",p:13},{n:"Delroy Lindo",p:5},{n:"Jacob Elordi",p:2}],
  best_supp_actress:      [{n:"Amy Madigan",p:56},{n:"Teyana Taylor",p:25},{n:"Wunmi Mosaku",p:16}],
  best_animated:          [{n:"KPop Demon Hunters",p:94},{n:"Zootopia 2",p:4},{n:"Elio",p:1}],
  best_intl:              [{n:"Sentimental Value",p:62},{n:"The Secret Agent",p:26},{n:"It Was Just an Accident",p:8}],
  best_documentary:       [{n:"The Perfect Neighbor",p:54},{n:"Mr. Nobody Against Putin",p:34},{n:"Come See Me in the Good Light",p:8}],
  best_doc_short:         [{n:"All the Empty Rooms",p:70},{n:"The Devil Is Busy",p:18},{n:"Armed Only with a Camera",p:8}],
  best_live_action_short: [{n:"Two People Exchanging Saliva",p:40},{n:"A Friend of Dorothy",p:27},{n:"The Singers",p:22}],
  best_animated_short:    [{n:"Butterfly (Papillon)",p:50},{n:"Retirement Plan",p:30},{n:"Forevergreen",p:12}],
  best_orig_screenplay:   [{n:"Sinners (Coogler)",p:95},{n:"Sentimental Value",p:3},{n:"Marty Supreme",p:1}],
  best_adapt_screenplay:  [{n:"One Battle After Another",p:96},{n:"Hamnet",p:3},{n:"Train Dreams",p:1}],
  best_cinematography:    [{n:"One Battle After Another",p:77},{n:"Sinners",p:18},{n:"Train Dreams",p:4}],
  best_editing:           [{n:"One Battle After Another",p:82},{n:"Sinners",p:13},{n:"Marty Supreme",p:4}],
  best_score:             [{n:"Sinners (Göransson)",p:92},{n:"One Battle After Another",p:5},{n:"Hamnet",p:2}],
  best_song:              [{n:'"Golden" – KPop DH',p:86},{n:'"I Lied to You" – Sinners',p:10},{n:'"Train Dreams"',p:3}],
  best_production:        [{n:"Frankenstein",p:86},{n:"Sinners",p:8},{n:"Hamnet",p:4}],
  best_costume:           [{n:"Frankenstein",p:83},{n:"Sinners",p:11},{n:"Hamnet",p:4}],
  best_makeup:            [{n:"Frankenstein",p:91},{n:"Sinners",p:6},{n:"The Smashing Machine",p:2}],
  best_sound:             [{n:"F1",p:76},{n:"Sinners",p:15},{n:"Avatar: Fire and Ash",p:6}],
  best_vfx:               [{n:"Avatar: Fire and Ash",p:79},{n:"Sinners",p:12},{n:"F1",p:7}],
  best_casting:           [{n:"Sinners",p:89},{n:"Marty Supreme",p:7},{n:"One Battle After Another",p:3}],
};

// ─── VARIETY (Clayton Davis) FINAL PICKS (March 12, 2026) ────────────────────
const VARIETY = {
  best_picture:           "Sinners",
  best_director:          "Ryan Coogler",
  best_actor:             "Michael B. Jordan",
  best_actress:           "Jessie Buckley",
  best_supp_actor:        "Delroy Lindo",
  best_supp_actress:      "Amy Madigan",
  best_animated:          "KPop Demon Hunters",
  best_intl:              "Sentimental Value",
  best_documentary:       "Mr. Nobody Against Putin",
  best_doc_short:         "All the Empty Rooms",
  best_live_action_short: "Two People Exchanging Saliva",
  best_animated_short:    "Retirement Plan",
  best_orig_screenplay:   "Sinners (Coogler)",
  best_adapt_screenplay:  "One Battle After Another",
  best_cinematography:    "One Battle After Another",
  best_editing:           "One Battle After Another",
  best_score:             "Sinners (Göransson)",
  best_song:              '"Golden" – KPop DH',
  best_production:        "Frankenstein",
  best_costume:           "Frankenstein",
  best_makeup:            "Frankenstein",
  best_sound:             "F1",
  best_vfx:               "Avatar: Fire and Ash",
  best_casting:           "Sinners",
};

// ─── PCHH PICKS (NPR Pop Culture Happy Hour, full episode transcript, Mar 13) ─
// The hosts covered 6 categories. These are their "will win" picks; their
// "should win" picks are kept in the comments only. Not used in the ensemble.
const PCHH_DEFAULTS = {
  linda: {
    // Will win
    best_picture:    "One Battle After Another",  // should: Sinners
    best_actor:      "Timothée Chalamet",          // should: Jordan
    best_actress:    "Jessie Buckley",             // should: Rose Byrne
    best_supp_actress: "Teyana Taylor",            // should: Amy Madigan
    best_supp_actor: "Sean Penn",                  // should: Jacob Elordi
    best_director:   "Ryan Coogler",               // should: Ryan Coogler
  },
  stephen: {
    best_picture:    "Sinners",                    // should: Sinners
    best_actor:      "Michael B. Jordan",          // should: Jordan
    best_actress:    "Jessie Buckley",             // should: Jessie Buckley
    best_supp_actress: "Teyana Taylor",            // should: Amy Madigan
    best_supp_actor: "Stellan Skarsgård",          // should: Delroy Lindo
    best_director:   "Ryan Coogler",               // should: Ryan Coogler
  },
  glen: {
    best_picture:    "One Battle After Another",   // should: Sinners
    best_actor:      "Timothée Chalamet",          // should: Jordan
    best_actress:    "Jessie Buckley",             // should: Rose Byrne
    best_supp_actress: "Teyana Taylor",            // should: Amy Madigan
    best_supp_actor: "Sean Penn",                  // should: Delroy Lindo
    best_director:   "Paul Thomas Anderson",       // should: Ryan Coogler
  },
  aisha: {
    best_picture:    "One Battle After Another",   // should: Sinners
    best_actor:      "Timothée Chalamet",          // should: Jordan
    best_actress:    "Jessie Buckley",             // should: Renate Reinsve
    best_supp_actress: "Teyana Taylor",            // should: Elle Fanning
    best_supp_actor: "Stellan Skarsgård",          // should: Delroy Lindo
    best_director:   "Paul Thomas Anderson",       // should: Ryan Coogler
  },
};

// ─── ACTUAL WINNERS (added after the ceremony, for grading) ──────────────────
// Names are spelled to match the source data above. Live Action Short was a
// tie, so either winner counts as correct.
const ACTUAL_WINNERS = {
  best_picture:           ["One Battle After Another"],
  best_director:          ["Paul Thomas Anderson"],
  best_actor:             ["Michael B. Jordan"],
  best_actress:           ["Jessie Buckley"],
  best_supp_actor:        ["Sean Penn"],
  best_supp_actress:      ["Amy Madigan"],
  best_animated:          ["KPop Demon Hunters"],
  best_intl:              ["Sentimental Value"],
  best_documentary:       ["Mr. Nobody Against Putin"],
  best_doc_short:         ["All the Empty Rooms"],
  best_live_action_short: ["The Singers", "Two People Exchanging Saliva"],
  best_animated_short:    ["The Girl Who Cried Pearls"],
  best_orig_screenplay:   ["Sinners (Coogler)"],
  best_adapt_screenplay:  ["One Battle After Another"],
  best_cinematography:    ["Sinners"],
  best_editing:           ["One Battle After Another"],
  best_score:             ["Sinners (Göransson)"],
  best_song:              ['"Golden" – KPop DH'],
  best_production:        ["Frankenstein"],
  best_costume:           ["Frankenstein"],
  best_makeup:            ["Frankenstein"],
  best_sound:             ["F1"],
  best_vfx:               ["Avatar: Fire and Ash"],
  best_casting:           ["One Battle After Another"],
};

// Short post-mortem notes for the four misses (shown in results view).
const MISS_NOTES = {
  best_cinematography: "All three sources had One Battle on top (Gold Derby 55%, both markets 77%). Autumn Durald Arkapaw became the first woman to win the category. That historic-first story had no quantitative signal the model could weigh.",
  best_documentary:    "The model's pick was only 54%, with the eventual winner a clear second at 36%. The model's own probabilities left room for this miss. Variety's Clayton Davis called it correctly.",
  best_casting:        "First year the category existed, so there was no historical base rate. The markets' 88–89% confidence was false precision, and the model passed it straight through.",
  best_animated_short: "The winner was not in any source's top three. Shorts have small, idiosyncratic voting pools and thin public data.",
};

// ─── CATEGORIES ─────────────────────────────────────────────────────────────
const CATS = [
  {id:"best_picture",label:"Best Picture"},
  {id:"best_director",label:"Best Director"},
  {id:"best_actor",label:"Best Actor"},
  {id:"best_actress",label:"Best Actress"},
  {id:"best_supp_actor",label:"Best Supporting Actor"},
  {id:"best_supp_actress",label:"Best Supporting Actress"},
  {id:"best_animated",label:"Best Animated Feature"},
  {id:"best_intl",label:"Best International Feature"},
  {id:"best_documentary",label:"Best Documentary Feature"},
  {id:"best_doc_short",label:"Best Documentary Short"},
  {id:"best_live_action_short",label:"Best Live Action Short"},
  {id:"best_animated_short",label:"Best Animated Short"},
  {id:"best_orig_screenplay",label:"Best Original Screenplay"},
  {id:"best_adapt_screenplay",label:"Best Adapted Screenplay"},
  {id:"best_cinematography",label:"Best Cinematography"},
  {id:"best_editing",label:"Best Film Editing"},
  {id:"best_score",label:"Best Original Score"},
  {id:"best_song",label:"Best Original Song"},
  {id:"best_production",label:"Best Production Design"},
  {id:"best_costume",label:"Best Costume Design"},
  {id:"best_makeup",label:"Best Makeup & Hairstyling"},
  {id:"best_sound",label:"Best Sound"},
  {id:"best_vfx",label:"Best Visual Effects"},
  {id:"best_casting",label:"Best Casting"},
];

const MAJOR = new Set(["best_picture","best_director","best_actor","best_actress","best_supp_actor","best_supp_actress"]);
const CONTESTED_THRESHOLD = 60; // ensemble top pick below this = "contested"

// ─── NOMINEES (for ballot dropdowns) ────────────────────────────────────────
// Derived from the three probability sources combined, deduplicated by name.
// Sources list only their top 3–4 nominees, so a dropdown may not show every
// nominee in the category.
function getNominees(catId) {
  const seen = new Set();
  const all = [...(GD[catId]||[]), ...(KALSHI[catId]||[]), ...(POLY[catId]||[])];
  return all.reduce((acc, d) => {
    if (!seen.has(d.n)) { seen.add(d.n); acc.push(d.n); }
    return acc;
  }, []);
}

// ─── NAME MATCHING ──────────────────────────────────────────────────────────
// Sources label nominees slightly differently ("Sinners" vs "Sinners (Coogler)").
// Normalize, then treat two names as the same if either contains the other's
// first 10 characters.
function fuzzyMatch(a, b) {
  if (!a || !b) return false;
  const n = s => s.toLowerCase().replace(/[^a-z0-9]/g,"");
  const na = n(a), nb = n(b);
  return na === nb || na.includes(nb.slice(0,10)) || nb.includes(na.slice(0,10));
}

// ─── ENSEMBLE CALCULATION ───────────────────────────────────────────────────
// 1. Weighted average of the three sources' probabilities (weights by group).
// 2. If a guild precursor exists, blend the guild winner's score 75/25 toward
//    that guild's historical accuracy.
// 3. Renormalize across the listed nominees so the category sums to 100%.
function computeEnsemble(catId) {
  const [wGD, wK, wP] = SOURCE_WEIGHTS[CAT_WEIGHT_GROUP[catId] || "technical"];
  const precursor = PRECURSORS[catId];
  const gd = GD[catId] || [], k = KALSHI[catId] || [], p = POLY[catId] || [];
  const allNames = new Set([...gd,...k,...p].map(d => d.n));
  if (!allNames.size) return [];

  const scores = {};
  allNames.forEach(name => {
    const gp = (gd.find(d => fuzzyMatch(d.n,name))?.p || 0);
    const kp = (k.find(d => fuzzyMatch(d.n,name))?.p || 0);
    const pp = (p.find(d => fuzzyMatch(d.n,name))?.p || 0);
    scores[name] = { score: gp*wGD + kp*wK + pp*wP };
  });

  if (precursor) {
    const key = Object.keys(scores).find(k => fuzzyMatch(k, precursor.winner));
    if (key) {
      const bf = 0.25;
      scores[key].score = scores[key].score*(1-bf) + (precursor.accuracy/100)*100*bf;
      scores[key].hasPrecursor = true;
      scores[key].precursorSource = precursor.source;
      scores[key].precursorAccuracy = precursor.accuracy;
    }
  }

  const total = Object.values(scores).reduce((s,v) => s+v.score, 0);
  if (total > 0) Object.keys(scores).forEach(k => { scores[k].score = Math.round(scores[k].score/total*100); });

  return Object.entries(scores).sort(([,a],[,b]) => b.score-a.score).map(([name,data]) => ({name,...data}));
}

// Computed once. The data is a frozen snapshot, so there is nothing to recompute.
const ENSEMBLE = Object.fromEntries(CATS.map(c => [c.id, computeEnsemble(c.id)]));

// ─── GRADING ────────────────────────────────────────────────────────────────
function isWinner(catId, name) {
  return !!name && (ACTUAL_WINNERS[catId] || []).some(w => fuzzyMatch(w, name));
}

// Probability a source put on the eventual winner (summed across tied winners).
function probOnWinner(list, catId) {
  return list.filter(d => isWinner(catId, d.n)).reduce((s, d) => s + d.p, 0);
}

// Multi-category Brier score for one category: sum over nominees of
// (forecast probability − outcome)². Every source is scored on the same
// nominee set (every name any source listed, plus the actual winner).
// Lower is better. A nominee a source didn't list counts as 0%.
function brierForCategory(list, catId) {
  const names = [];
  const add = n => { if (!names.some(x => fuzzyMatch(x, n))) names.push(n); };
  [...(GD[catId]||[]), ...(KALSHI[catId]||[]), ...(POLY[catId]||[])].forEach(d => add(d.n));
  (ACTUAL_WINNERS[catId] || []).forEach(add);
  return names.reduce((s, n) => {
    const p = (list.find(d => fuzzyMatch(d.n, n))?.p || 0) / 100;
    const y = isWinner(catId, n) ? 1 : 0;
    return s + (p - y) ** 2;
  }, 0);
}

function gradeSource(getList) {
  let hits = 0, pWin = 0, brier = 0;
  CATS.forEach(c => {
    const list = getList(c.id);
    if (isWinner(c.id, list[0]?.n)) hits++;
    pWin += probOnWinner(list, c.id);
    brier += brierForCategory(list, c.id);
  });
  return { hits, meanPWin: pWin / CATS.length, brier: brier / CATS.length };
}

function buildScorecard() {
  const ens = gradeSource(id => ENSEMBLE[id].map(e => ({ n: e.name, p: e.score })));
  const rows = [
    { label: "Weighted ensemble (this model)", ...ens, highlight: true },
    { label: "Kalshi alone",     ...gradeSource(id => KALSHI[id]) },
    { label: "Polymarket alone", ...gradeSource(id => POLY[id]) },
    { label: "Gold Derby alone", ...gradeSource(id => GD[id]) },
  ];
  const varietyHits = CATS.filter(c => isWinner(c.id, VARIETY[c.id])).length;
  const guildIds = Object.keys(PRECURSORS);
  const guildHits = guildIds.filter(id => isWinner(id, PRECURSORS[id].winner)).length;
  const pchhIds = Object.keys(PCHH_DEFAULTS.linda);
  const hosts = Object.entries(PCHH_DEFAULTS).map(([h, picks]) => ({
    host: h[0].toUpperCase() + h.slice(1),
    hits: pchhIds.filter(id => isWinner(id, picks[id])).length,
  }));
  const ensOnPchh = pchhIds.filter(id => isWinner(id, ENSEMBLE[id][0]?.name)).length;
  const ensOnGuild = guildIds.filter(id => isWinner(id, ENSEMBLE[id][0]?.name)).length;

  // Accuracy by the ensemble's own confidence level.
  const buckets = [
    { label: "85%+",   test: s => s >= 85 },
    { label: "70–84%", test: s => s >= 70 && s < 85 },
    { label: "<70%",   test: s => s < 70 },
  ].map(b => {
    const cats = CATS.filter(c => b.test(ENSEMBLE[c.id][0].score));
    return { label: b.label, n: cats.length, hits: cats.filter(c => isWinner(c.id, ENSEMBLE[c.id][0].name)).length };
  });

  return { rows, varietyHits, guildHits, guildTotal: guildIds.length, hosts, pchhTotal: pchhIds.length, ensOnPchh, ensOnGuild, buckets };
}
const SCORECARD = buildScorecard();
const ENSEMBLE_HITS = SCORECARD.rows[0].hits;

// ─── EXPORT CSV ─────────────────────────────────────────────────────────────
function exportCSV(cats, linda, stephen, glen, aisha, picks) {
  const hdr = ["Category","Ensemble Pick","Ensemble %","Actual Winner","Ensemble Correct","Precursor","GD #1","GD %","Kalshi #1","Kalshi %","Poly #1","Poly %","Variety (Davis)","Linda","Stephen","Glen","Aisha","My Pick"];
  const rows = cats.map(c => {
    const top = ENSEMBLE[c.id][0]; const prec = PRECURSORS[c.id];
    return [c.label, top?.name||"", top?.score!=null?`${top.score}%`:"",
      (ACTUAL_WINNERS[c.id]||[]).join(" / "), isWinner(c.id, top?.name) ? "Yes" : "No",
      prec?`${prec.source}: ${prec.winner} (~${prec.accuracy}%)`:"",
      GD[c.id]?.[0]?.n||"", GD[c.id]?.[0]?.p!=null?`${GD[c.id][0].p}%`:"",
      KALSHI[c.id]?.[0]?.n||"", KALSHI[c.id]?.[0]?.p!=null?`${KALSHI[c.id][0].p}%`:"",
      POLY[c.id]?.[0]?.n||"", POLY[c.id]?.[0]?.p!=null?`${POLY[c.id][0].p}%`:"",
      VARIETY[c.id]||"",
      linda[c.id]||"", stephen[c.id]||"", glen[c.id]||"", aisha[c.id]||"",
      picks[c.id]||""];
  });
  const csv = [hdr,...rows].map(r => r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
  a.download="oscars-2026-ballot.csv"; a.click();
}

// ─── UI COMPONENTS ──────────────────────────────────────────────────────────
const WonTag = () => (
  <span style={{fontSize:8,fontWeight:800,letterSpacing:1,background:"rgba(152,228,160,0.18)",color:"#98e4a0",borderRadius:3,padding:"1px 5px",flexShrink:0}}>WON</span>
);

function Bar({val, color, glow}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <div style={{flex:1,height:5,background:"rgba(255,255,255,0.07)",borderRadius:3,overflow:"hidden"}}>
        <div style={{width:`${Math.min(val,100)}%`,height:"100%",background:color,borderRadius:3,transition:"width 0.8s ease",boxShadow:glow?`0 0 8px ${color}`:"none"}}/>
      </div>
      <span style={{fontSize:11,fontWeight:700,color,minWidth:28,textAlign:"right"}}>{val}%</span>
    </div>
  );
}

function SourceBlock({title, color, emoji, items, catId, showResults}) {
  return (
    <div>
      <div style={{fontSize:9,color,textTransform:"uppercase",letterSpacing:2,marginBottom:7}}>{emoji} {title}</div>
      {!items?.length
        ? <div style={{fontSize:11,color:"#3a3a3a",fontStyle:"italic"}}>No data</div>
        : items.slice(0,4).map((m,i) => (
          <div key={i} style={{marginBottom:6}}>
            <div style={{fontSize:11,color:"#aaa",marginBottom:2,display:"flex",alignItems:"center",gap:5,overflow:"hidden"}}>
              <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.n}</span>
              {showResults && isWinner(catId, m.n) && <WonTag/>}
            </div>
            <Bar val={m.p} color={color}/>
          </div>
        ))
      }
    </div>
  );
}

function EnsembleBlock({ensemble, catId, showResults}) {
  if (!ensemble?.length) return null;
  return (
    <div style={{background:"rgba(212,175,55,0.06)",border:"1px solid rgba(212,175,55,0.2)",borderRadius:8,padding:"12px 14px"}}>
      <div style={{fontSize:9,color:"#d4af37",textTransform:"uppercase",letterSpacing:2,marginBottom:8}}>⚖️ Weighted Ensemble: GD + Kalshi + Poly + guild</div>
      {ensemble.slice(0,4).map((e,i) => (
        <div key={i} style={{marginBottom:7}}>
          <div style={{fontSize:11,color:i===0?"#f0e9d6":"#999",marginBottom:2,display:"flex",alignItems:"center",gap:5,overflow:"hidden"}}>
            <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.name}</span>
            {e.hasPrecursor && (
              <span title={`${e.precursorSource} winner (~${e.precursorAccuracy}% historical match rate)`}
                style={{fontSize:9,background:"rgba(212,175,55,0.2)",color:"#d4af37",borderRadius:3,padding:"1px 5px",flexShrink:0}}>
                {e.precursorSource} ✓
              </span>
            )}
            {showResults && isWinner(catId, e.name) && <WonTag/>}
          </div>
          <Bar val={e.score} color={i===0?"#d4af37":"#555"} glow={i===0}/>
        </div>
      ))}
    </div>
  );
}

function Panel({cat, showResults, defaultOpen, linda, onLinda, stephen, onStephen, glen, onGlen, aisha, onAisha, pick, onPick}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const gd = GD[cat.id]||[], k = KALSHI[cat.id]||[], p = POLY[cat.id]||[];
  const variety = VARIETY[cat.id];
  const ensemble = ENSEMBLE[cat.id];
  const precursor = PRECURSORS[cat.id];
  const topEns = ensemble[0];
  const displayName = pick || topEns?.name || gd[0]?.n || "—";
  const displayProb = topEns?.score;
  const correct = isWinner(cat.id, topEns?.name);
  const winners = ACTUAL_WINNERS[cat.id] || [];

  // Flag categories where Variety's final pick differs from the ensemble's pick.
  const varietyDiverges = variety && topEns && !fuzzyMatch(variety, topEns.name);

  const resultBorder = correct ? "rgba(152,228,160,0.28)" : "rgba(255,108,60,0.45)";
  const baseBorder = showResults ? resultBorder : (pick ? "rgba(152,228,160,0.3)" : "rgba(255,255,255,0.07)");

  return (
    <div data-cat={cat.id} style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${baseBorder}`,borderRadius:10,overflow:"hidden",transition:"border-color 0.2s"}}>

      <div onClick={()=>setOpen(x=>!x)} style={{padding:"11px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:9,color:"#d4af37",textTransform:"uppercase",letterSpacing:2,marginBottom:2,display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
            {cat.label}
            {precursor && <span style={{fontSize:8,background:"rgba(212,175,55,0.15)",color:"#d4af37",borderRadius:3,padding:"1px 4px"}}>{precursor.source}</span>}
            {varietyDiverges && <span style={{fontSize:8,background:"rgba(255,120,80,0.15)",color:"#ff7850",borderRadius:3,padding:"1px 4px"}}>⚡ Variety differs</span>}
          </div>
          <div style={{fontSize:13,fontWeight:600,fontFamily:"'Cormorant Garamond',serif",fontVariantNumeric:"lining-nums",color:pick&&!showResults?"#98e4a0":"#f0e9d6",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {pick && !showResults ? `✓ ${pick}` : displayName}
          </div>
          {showResults && (
            <div style={{fontSize:10,marginTop:3,fontWeight:700,color:correct?"#98e4a0":"#ff6c3c",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {correct
                ? (winners.length > 1 ? "✓ Correct (two-way tie)" : "✓ Correct")
                : `✗ Missed · Winner: ${winners.join(" & ")}`}
            </div>
          )}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          {displayProb != null && <div style={{textAlign:"right"}}>
            <div style={{fontSize:8,color:"#555",marginBottom:1}}>ensemble</div>
            <div style={{fontSize:16,fontWeight:800,color:"#d4af37"}}>{displayProb}%</div>
          </div>}
          <span style={{fontSize:12,color:"#444"}}>{open?"▲":"▼"}</span>
        </div>
      </div>

      {open && (
        <div style={{borderTop:"1px solid rgba(255,255,255,0.05)",padding:14,display:"flex",flexDirection:"column",gap:14}}>
          {showResults && (
            <div style={{background:correct?"rgba(152,228,160,0.06)":"rgba(255,108,60,0.07)",border:`1px solid ${correct?"rgba(152,228,160,0.25)":"rgba(255,108,60,0.3)"}`,borderRadius:6,padding:"8px 10px",fontSize:11,color:"#bbb",lineHeight:1.5}}>
              <span style={{color:correct?"#98e4a0":"#ff6c3c",fontWeight:700}}>🏆 Winner: {winners.join(" & ")}</span>
              {winners.length > 1 && <span style={{color:"#777"}}> (tie)</span>}
              <span style={{color:"#777"}}> · ensemble gave the winner {probOnWinner(ensemble.map(e=>({n:e.name,p:e.score})), cat.id)}%</span>
              {MISS_NOTES[cat.id] && <div style={{marginTop:5,color:"#aaa"}}>{MISS_NOTES[cat.id]}</div>}
            </div>
          )}

          <EnsembleBlock ensemble={ensemble} catId={cat.id} showResults={showResults}/>

          {precursor && (
            <div style={{background:"rgba(212,175,55,0.05)",border:"1px solid rgba(212,175,55,0.15)",borderRadius:6,padding:"8px 10px",fontSize:11,color:"#999"}}>
              <span style={{color:"#d4af37",fontWeight:700}}>{precursor.source} winner:</span> {precursor.winner}
              <span style={{color:"#555",marginLeft:6}}>(~{precursor.accuracy}% historical Oscar match rate, industry-cited)</span>
            </div>
          )}

          <SourceBlock title="Gold Derby: Expert Consensus" color="#c9a227" emoji="🏆" items={gd} catId={cat.id} showResults={showResults}/>
          <SourceBlock title="Kalshi" color="#7eb8f7" emoji="📊" items={k} catId={cat.id} showResults={showResults}/>
          <SourceBlock title="Polymarket" color="#c084fc" emoji="🔮" items={p} catId={cat.id} showResults={showResults}/>

          {variety && (
            <div style={{background: varietyDiverges ? "rgba(255,120,80,0.06)" : "rgba(255,255,255,0.03)", border:`1px solid ${varietyDiverges?"rgba(255,120,80,0.25)":"rgba(255,255,255,0.08)"}`,borderRadius:6,padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:13}}>📰</span>
              <div>
                <div style={{fontSize:9,color: varietyDiverges?"#ff7850":"#888",textTransform:"uppercase",letterSpacing:2,marginBottom:2}}>Variety / Clayton Davis{varietyDiverges?" (differs from ensemble)":""} · not in ensemble</div>
                <div style={{fontSize:12,fontWeight:700,color: varietyDiverges?"#ff7850":"#f0e9d6",display:"flex",alignItems:"center",gap:6}}>
                  {variety}{showResults && isWinner(cat.id, variety) && <WonTag/>}
                </div>
              </div>
            </div>
          )}

          <div>
            <div style={{fontSize:9,color:"#e8a0bf",textTransform:"uppercase",letterSpacing:2,marginBottom:8}}>🎙️ NPR Pop Culture Happy Hour · not in ensemble</div>
            {[
              ["Linda", linda, onLinda],
              ["Stephen", stephen, onStephen],
              ["Glen", glen, onGlen],
              ["Aisha", aisha, onAisha],
            ].map(([host, val, setter]) => {
              const nominees = getNominees(cat.id);
              return (
                <div key={host} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                  <div style={{fontSize:9,color:"#e8a0bf",minWidth:46,fontWeight:700,letterSpacing:1}}>{host}</div>
                  <select value={val} onChange={e=>setter(e.target.value)} onClick={e=>e.stopPropagation()}
                    style={{flex:1,background:"#14121e",border:"1px solid rgba(232,160,191,0.2)",borderRadius:5,padding:"5px 9px",color:val?"#f0e9d6":"#555",fontSize:12,outline:"none",fontFamily:"inherit",cursor:"pointer",appearance:"auto"}}>
                    <option value="">— not covered —</option>
                    {nominees.map(n => <option key={n} value={n} style={{background:"#14121e",color:"#f0e9d6"}}>{n}</option>)}
                  </select>
                  {showResults && val && <span style={{fontSize:11,width:12,color:isWinner(cat.id,val)?"#98e4a0":"#ff6c3c"}}>{isWinner(cat.id,val)?"✓":"✗"}</span>}
                </div>
              );
            })}
          </div>
          <div>
            <div style={{fontSize:9,color:"#98e4a0",textTransform:"uppercase",letterSpacing:2,marginBottom:5}}>⭐ My Ballot Pick</div>
            <select value={pick} onChange={e=>onPick(e.target.value)} onClick={e=>e.stopPropagation()}
              style={{width:"100%",background:"#14121e",border:"1px solid rgba(152,228,160,0.25)",borderRadius:5,padding:"5px 9px",color:pick?"#98e4a0":"#555",fontSize:12,outline:"none",fontFamily:"inherit",fontWeight:700,cursor:"pointer",appearance:"auto"}}>
              <option value="">— Your final pick —</option>
              {getNominees(cat.id).map(n => <option key={n} value={n} style={{background:"#14121e",color:"#98e4a0"}}>{n}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

function Scorecard() {
  const s = SCORECARD;
  const th = {textAlign:"right",padding:"6px 8px",fontSize:9,color:"#777",textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,borderBottom:"1px solid rgba(255,255,255,0.08)"};
  const td = {textAlign:"right",padding:"7px 8px",fontSize:12,color:"#ccc",borderBottom:"1px solid rgba(255,255,255,0.04)",fontVariantNumeric:"tabular-nums"};
  return (
    <div data-shot="scorecard" style={{maxWidth:760,margin:"0 auto 12px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(212,175,55,0.25)",borderRadius:10,padding:"14px 16px",textAlign:"left"}}>
      <div style={{fontSize:11,fontWeight:700,color:"#d4af37",marginBottom:2}}>📋 Scorecard: ensemble vs. each input on its own</div>
      <div style={{fontSize:10,color:"#666",marginBottom:10}}>Graded against the actual winners. Every source is scored on the same 24 categories.</div>
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr>
          <th style={{...th,textAlign:"left"}}>Forecast</th>
          <th style={th}>Top pick correct</th>
          <th style={th}>Avg. prob. on winner</th>
          <th style={th}>Brier (lower = better)</th>
        </tr></thead>
        <tbody>
          {s.rows.map(r => (
            <tr key={r.label} style={{background:r.highlight?"rgba(212,175,55,0.07)":"transparent"}}>
              <td style={{...td,textAlign:"left",color:r.highlight?"#d4af37":"#ccc",fontWeight:r.highlight?700:400}}>{r.label}</td>
              <td style={td}>{r.hits}/24</td>
              <td style={td}>{r.meanPWin.toFixed(1)}%</td>
              <td style={td}>{r.brier.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:8,marginTop:12}}>
        <div style={{background:"rgba(255,255,255,0.03)",borderRadius:6,padding:"8px 10px"}}>
          <div style={{fontSize:9,color:"#777",textTransform:"uppercase",letterSpacing:1.5,marginBottom:3}}>Pick-only sources</div>
          <div style={{fontSize:11,color:"#bbb",lineHeight:1.6}}>
            Guild precursors: <b style={{color:"#f0e9d6"}}>{s.guildHits}/{s.guildTotal}</b> (ensemble {s.ensOnGuild}/{s.guildTotal} on the same categories)<br/>
            Variety / Davis: <b style={{color:"#f0e9d6"}}>{s.varietyHits}/24</b><br/>
            NPR Pop Culture Happy Hour hosts: {s.hosts.map(h => `${h.host} ${h.hits}`).join(" · ")} of {s.pchhTotal} (ensemble {s.ensOnPchh}/{s.pchhTotal})
          </div>
        </div>
        <div style={{background:"rgba(255,255,255,0.03)",borderRadius:6,padding:"8px 10px"}}>
          <div style={{fontSize:9,color:"#777",textTransform:"uppercase",letterSpacing:1.5,marginBottom:3}}>Ensemble accuracy by its own confidence</div>
          <div style={{fontSize:11,color:"#bbb",lineHeight:1.6}}>
            {s.buckets.map(b => <div key={b.label}>{b.label}: <b style={{color:"#f0e9d6"}}>{b.hits}/{b.n}</b> correct</div>)}
          </div>
        </div>
      </div>
      <div style={{fontSize:10,color:"#777",marginTop:10,lineHeight:1.5}}>
        <b style={{color:"#aaa"}}>Honest read:</b> the ensemble tied both prediction markets on top picks and did not clearly beat any of its inputs.
        One ceremony (24 categories) is far too small a sample to separate forecasts this close. Testing that across many years is the job of the v2 roadmap.
        Live Action Short was a tie, so either winner counts.
      </div>
    </div>
  );
}

// ─── APP ────────────────────────────────────────────────────────────────────
export default function App() {
  const [linda, setLinda] = useState(PCHH_DEFAULTS.linda);
  const [stephen, setStephen] = useState(PCHH_DEFAULTS.stephen);
  const [glen, setGlen] = useState(PCHH_DEFAULTS.glen);
  const [aisha, setAisha] = useState(PCHH_DEFAULTS.aisha);
  const [picks, setPicks] = useState({});
  // Optional URL parameters (used to reproduce the README screenshots):
  //   ?view=forecast|results  &filter=major|contested|misses  &open=<id>,<id>  &method=1
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const [filter, setFilter] = useState(() => params.get("filter") || "all");
  const [showMethod, setShowMethod] = useState(() => !!params.get("method"));
  const [view, setView] = useState(() => params.get("view") === "forecast" ? "forecast" : "results");
  const openIds = (params.get("open") || "").split(",");

  const showResults = view === "results";
  const effectiveFilter = !showResults && filter === "misses" ? "all" : filter;
  const visible = CATS.filter(c =>
    effectiveFilter==="major" ? MAJOR.has(c.id) :
    effectiveFilter==="contested" ? ENSEMBLE[c.id][0].score < CONTESTED_THRESHOLD :
    effectiveFilter==="misses" ? !isWinner(c.id, ENSEMBLE[c.id][0].name) :
    effectiveFilter==="mine" ? !!picks[c.id] : true
  );
  const pickedCount = CATS.filter(c=>picks[c.id]).length;
  const contested = CATS.filter(c => ENSEMBLE[c.id][0].score < CONTESTED_THRESHOLD);
  const varietySplits = CATS.filter(c => VARIETY[c.id] && !fuzzyMatch(VARIETY[c.id], ENSEMBLE[c.id][0].name));
  const misses = CATS.filter(c => !isWinner(c.id, ENSEMBLE[c.id][0].name));
  const short = label => label.replace(/^Best /,"");

  const filters = [["all","All 24"],["major","Major 6"],["contested",`Contested (<${CONTESTED_THRESHOLD}%)`]];
  if (showResults) filters.push(["misses","Misses"]);
  filters.push(["mine","My Picks"]);

  const stats = showResults
    ? [[`${ENSEMBLE_HITS}/24`,"Correct"],[`${24-ENSEMBLE_HITS}`,"Misses"],["3","Probability sources"],["4","Guild signals"]]
    : [["24","Categories"],[`${pickedCount}/24`,"Picks Made"],["3","Probability sources"],["4","Guild signals"]];

  const banner = (bg, border, color) => ({maxWidth:760,margin:"0 auto 8px",background:bg,border:`1px solid ${border}`,borderRadius:8,padding:"8px 14px",fontSize:11,color,textAlign:"left",lineHeight:1.5});

  return (
    <div style={{minHeight:"100vh",background:"#080710",backgroundImage:"radial-gradient(ellipse at 20% 0%,rgba(212,175,55,.09) 0%,transparent 55%),radial-gradient(ellipse at 80% 100%,rgba(126,184,247,.06) 0%,transparent 55%)",fontFamily:"'DM Sans',system-ui,sans-serif",color:"#f0e9d6",paddingBottom:60}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=DM+Sans:wght@400;600;700;800&display=swap'); *{box-sizing:border-box} body{margin:0;background:#080710}`}</style>

      <div data-shot="header" style={{textAlign:"center",padding:"40px 20px 24px",borderBottom:"1px solid rgba(212,175,55,.1)"}}>
        <div style={{fontSize:9,letterSpacing:5,color:"#d4af37",textTransform:"uppercase",marginBottom:8}}>98th Academy Awards · March 15, 2026</div>
        <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"clamp(26px,5vw,52px)",fontWeight:700,margin:"0 0 6px",background:"linear-gradient(135deg,#f0e9d6,#d4af37 50%,#f0e9d6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Oscar Prediction Ensemble</h1>
        <p style={{color:"#777",fontSize:12,margin:"0 0 4px"}}>Weighted ensemble of Gold Derby, Kalshi &amp; Polymarket, adjusted by guild precursors (DGA · PGA · SAG · WGA). Variety and NPR's Pop Culture Happy Hour are tracked for comparison.</p>
        <p style={{color:"#555",fontSize:10,margin:"0 0 20px"}}>Forecast snapshot: {DATA_DATE} · frozen data, not a live feed</p>

        <div style={{display:"inline-flex",border:"1px solid rgba(212,175,55,.3)",borderRadius:22,padding:3,marginBottom:18}}>
          {[["forecast","Ceremony-day forecast"],["results","Results & scorecard"]].map(([k,l]) => (
            <button key={k} onClick={()=>setView(k)} style={{padding:"6px 16px",borderRadius:18,border:"none",background:view===k?"rgba(212,175,55,.18)":"transparent",color:view===k?"#d4af37":"#777",fontSize:11,cursor:"pointer",fontWeight:700,letterSpacing:1}}>{l}</button>
          ))}
        </div>

        <div style={{display:"flex",justifyContent:"center",gap:24,flexWrap:"wrap",marginBottom:20}}>
          {stats.map(([v,l])=>(
            <div key={l}><div style={{fontSize:18,fontWeight:800,color:"#d4af37"}}>{v}</div><div style={{fontSize:8,color:"#666",textTransform:"uppercase",letterSpacing:2}}>{l}</div></div>
          ))}
        </div>

        <div style={{display:"flex",justifyContent:"center",gap:7,flexWrap:"wrap",marginBottom:12}}>
          {filters.map(([k,l])=>(
            <button key={k} onClick={()=>setFilter(k)} style={{padding:"5px 13px",borderRadius:20,border:"1px solid",borderColor:effectiveFilter===k?"#d4af37":"rgba(255,255,255,.1)",background:effectiveFilter===k?"rgba(212,175,55,.1)":"transparent",color:effectiveFilter===k?"#d4af37":"#666",fontSize:10,cursor:"pointer",fontWeight:700,letterSpacing:1}}>{l}</button>
          ))}
          <button onClick={()=>exportCSV(CATS,linda,stephen,glen,aisha,picks)} style={{padding:"5px 13px",borderRadius:20,border:"1px solid rgba(152,228,160,.25)",background:"rgba(152,228,160,.06)",color:"#98e4a0",fontSize:10,cursor:"pointer",fontWeight:700,letterSpacing:1}}>↓ Export CSV</button>
          <button onClick={()=>setShowMethod(x=>!x)} style={{padding:"5px 13px",borderRadius:20,border:"1px solid rgba(255,255,255,.1)",background:showMethod?"rgba(255,255,255,.06)":"transparent",color:"#888",fontSize:10,cursor:"pointer",fontWeight:700,letterSpacing:1}}>⚙ Methodology</button>
        </div>

        {showMethod && (
          <div data-shot="methodology" style={{maxWidth:760,margin:"0 auto 12px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:16,textAlign:"left"}}>
            <div style={{fontSize:11,fontWeight:700,color:"#d4af37",marginBottom:10}}>⚖️ How the ensemble works</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:8}}>
              {[
                ["🏆 Gold Derby","weight 0.38–0.55","Expert + crowd consensus. Weight rises in lower-profile categories, where market liquidity thins."],
                ["📊 Kalshi","weight 0.25–0.37","US-regulated real-money prediction market. Deepest in high-profile categories."],
                ["🔮 Polymarket","weight 0.20–0.25","Decentralized prediction market. Lowest weight in every group."],
                ["🎬 Guild precursors","25% blend","DGA ~90% · PGA ~72% · SAG ~68% · WGA ~62% (industry-cited match rates). The guild winner's score is blended 75/25 toward that rate."],
              ].map(([src,acc,note])=>(
                <div key={src} style={{background:"rgba(255,255,255,0.03)",borderRadius:6,padding:"8px 10px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#f0e9d6"}}>{src} <span style={{color:"#d4af37",fontWeight:600}}>{acc}</span></div>
                  <div style={{fontSize:10,color:"#888",marginTop:3,lineHeight:1.45}}>{note}</div>
                </div>
              ))}
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",marginTop:12,fontSize:11}}>
              <thead><tr>{["Weight group","Gold Derby","Kalshi","Polymarket"].map((h,i)=><th key={h} style={{textAlign:i?"right":"left",padding:"4px 6px",fontSize:9,color:"#777",textTransform:"uppercase",letterSpacing:1.5,borderBottom:"1px solid rgba(255,255,255,0.08)"}}>{h}</th>)}</tr></thead>
              <tbody>
                {[["Acting (4 categories)","major_acting"],["Best Picture","best_picture"],["Best Director","best_director"],["Screenplay (2)","screenplay"],["Craft, feature & technical (13)","technical"],["Shorts (3)","shorts"]].map(([l,g])=>(
                  <tr key={g}><td style={{padding:"4px 6px",color:"#bbb"}}>{l}</td>{SOURCE_WEIGHTS[g].map((w,i)=><td key={i} style={{textAlign:"right",padding:"4px 6px",color:"#ddd",fontVariantNumeric:"tabular-nums"}}>{w.toFixed(2)}</td>)}</tr>
                ))}
              </tbody>
            </table>
            <div style={{fontSize:10,color:"#777",marginTop:10,lineHeight:1.5}}>Weights were set by hand, not optimized against past results. Variety and Pop Culture Happy Hour picks are displayed for comparison but never enter the calculation. Full detail: docs/methodology.md.</div>
          </div>
        )}

        {showResults ? (
          <>
            <Scorecard/>
            <div style={banner("rgba(255,100,60,0.06)","rgba(255,100,60,0.25)","#ff8a64")}>
              <strong>Post-mortem:</strong> {ENSEMBLE_HITS} of 24 correct, including every major category. The {misses.length} misses: {misses.map(c=>short(c.label)).join(", ")}.
              None of them came from a weighting error. Each sat where the quantitative signal was thin, missing, or unable to capture what decided the vote. Expand a red card for details.
            </div>
          </>
        ) : (
          <>
            <div style={banner("rgba(255,100,60,0.06)","rgba(255,100,60,0.25)","#ff8a64")}>
              <strong>🎬 Ceremony day, 3:30 pm ET:</strong> Markets were locked on One Battle After Another for Picture (Kalshi 77% / Polymarket 79%) and on Paul Thomas Anderson for Director (93% / 92%).
              The ensemble's closest calls (top pick under {CONTESTED_THRESHOLD}%): {contested.map(c=>`${short(c.label)} ${ENSEMBLE[c.id][0].score}%`).join(" · ")}.
            </div>
            <div style={banner("rgba(212,175,55,0.06)","rgba(212,175,55,0.2)","#d4af37")}>
              <strong>🗞️ Variety / Clayton Davis (final picks, Mar 12):</strong> differs from the ensemble in {varietySplits.length} categories: {varietySplits.map(c=>short(c.label)).join(", ")}. Tracked for comparison, not blended into the model.
            </div>
            <div style={banner("rgba(232,160,191,0.05)","rgba(232,160,191,0.2)","#e8a0bf")}>
              <strong>🎙️ Pop Culture Happy Hour (Mar 13 episode, "will win" picks, 6 categories):</strong> Actor splits 3–1 for Chalamet (Linda, Glen, Aisha) over Jordan (Stephen).
              All four take Buckley for Actress and Teyana Taylor for Supporting Actress. Supporting Actor: Penn (Linda, Glen) vs. Skarsgård (Stephen, Aisha).
              Director: Anderson (Glen, Aisha) vs. Coogler (Linda, Stephen). Picture: One Battle (Linda, Glen, Aisha) vs. Sinners (Stephen).
            </div>
          </>
        )}
      </div>

      <div data-shot="grid" style={{maxWidth:1080,margin:"0 auto",padding:"20px 14px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(295px,1fr))",gap:9,alignItems:"start"}}>
        {visible.map(cat=>(
          <Panel key={cat.id+view} cat={cat} showResults={showResults} defaultOpen={openIds.includes(cat.id)}
            linda={linda[cat.id]||""} onLinda={v=>setLinda(p=>({...p,[cat.id]:v}))}
            stephen={stephen[cat.id]||""} onStephen={v=>setStephen(p=>({...p,[cat.id]:v}))}
            glen={glen[cat.id]||""} onGlen={v=>setGlen(p=>({...p,[cat.id]:v}))}
            aisha={aisha[cat.id]||""} onAisha={v=>setAisha(p=>({...p,[cat.id]:v}))}
            pick={picks[cat.id]||""} onPick={v=>setPicks(p=>({...p,[cat.id]:v}))}/>
        ))}
        {visible.length===0 && (
          <div style={{gridColumn:"1/-1",textAlign:"center",padding:50,color:"#555"}}>
            <div style={{fontSize:28,marginBottom:10}}>🏆</div>
            <div style={{fontSize:13}}>No picks yet. Expand a category and fill in your ballot.</div>
          </div>
        )}
      </div>

      <div style={{textAlign:"center",fontSize:9,color:"#444",padding:"0 20px",lineHeight:2}}>
        <span style={{color:"#d4af37",marginRight:12}}>■ Weighted Ensemble</span>
        <span style={{color:"#c9a227",marginRight:12}}>■ Gold Derby</span>
        <span style={{color:"#7eb8f7",marginRight:12}}>■ Kalshi</span>
        <span style={{color:"#c084fc",marginRight:12}}>■ Polymarket</span>
        <span style={{color:"#ff7850",marginRight:12}}>■ Variety/Davis</span>
        <span style={{color:"#e8a0bf",marginRight:12}}>■ Pop Culture Happy Hour</span>
        <span style={{color:"#98e4a0"}}>■ My Ballot</span>
      </div>
    </div>
  );
}
