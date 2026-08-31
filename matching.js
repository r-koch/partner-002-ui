/* ============================================================================
   PARTNER-002 — UI prototype (slice 7c) — synthetic matching module
   ----------------------------------------------------------------------------
   Implements the slice 7c matching semantics, deterministically, with
   SYNTHETIC candidate data only. Vanilla JS, no network, no persistence.

   Semantics (per dispatch-20260830-ui-redflags-score.md + the matching record
   candidate-display-matching.md §3):

   1. RED FLAGS = HARD EXCLUSIONS (private).  A candidate whose preference
      includes any answer value the user has red-flagged NEVER appears — no
      weighting, no ranking, no "close but".  This is the PSI-dealbreaker
      stage extended to per-item user-chosen flags.  Red flags are private:
      the score/breakdown never reveals WHY a candidate is absent (the other
      side never learns either; only "dealbreaker check passed/failed").

   2. MATCH SCORE = HONEST PREFERENCE-OVERLAP SCORE.  base 100, minus a
      weighted penalty per non-matching item, where the weight is the USER'S
      OWN importance rating (1-5) on that item.  Equivalent, re-derivable
      form: score = round(100 * matchedWeight / totalWeight).  It is
      preference overlap ONLY — NOT a chemistry / compatibility prediction.

   This module has no DOM dependency in its scoring core, so it runs under
   Node for the gate self-test (`node matching.js --selftest`).
   ========================================================================== */
(function (root) {
  "use strict";

  /* ---- item registry — questionnaire items feed the score --------------- */
  var ITEMS = {
    goal:      { label: "Relationship goal",  category: "Values" },
    children:  { label: "Kids",               category: "Values" },
    monogamy:  { label: "Monogamy",           category: "Values" },
    smoking:   { label: "Smoking",            category: "Lifestyle" },
    religion:  { label: "Religion",           category: "Values" },
    distance:  { label: "Distance",           category: "Logistics" },
    age:       { label: "Age range",          category: "Logistics" },
    living:    { label: "Living arrangement", category: "Lifestyle" },
    work:      { label: "Work rhythm",        category: "Lifestyle" },
    pets:      { label: "Pets",               category: "Lifestyle" },
    politics:  { label: "Politics",           category: "Values" },
    freetime:  { label: "Free-time style",    category: "Lifestyle" }
  };

  var CATEGORY_ORDER = ["Values", "Lifestyle", "Logistics"];

  /* ---- synthetic candidate pool (made-up data only) --------------------- */
  var CANDIDATES = [
    { id: "A", answers: {
        goal: "long-term", children: "yes", monogamy: "strictly",
        smoking: "never", religion: "none", distance: "city", age: 29,
        living: "alone", work: "flexible", pets: "love",
        politics: "liberal", freetime: "active-outdoors" } },
    { id: "B", answers: {
        goal: "long-term", children: "yes", monogamy: "strictly",
        smoking: "socially", religion: "christian", distance: "city", age: 34,
        living: "alone", work: "flexible", pets: "tolerate",
        politics: "center", freetime: "homebody" } },
    { id: "C", answers: {
        goal: "casual", children: "open", monogamy: "open-relationship",
        smoking: "socially", religion: "none", distance: "regional", age: 25,
        living: "flatmates", work: "shift", pets: "none",
        politics: "apolitical", freetime: "travel" } },
    { id: "D", answers: {
        goal: "casual", children: "no", monogamy: "undecided",
        smoking: "regularly", religion: "other", distance: "long-distance", age: 41,
        living: "family", work: "irregular", pets: "allergic",
        politics: "conservative", freetime: "city-culture" } }
  ];

  /* ---- default user (matches the pre-checked prototype answers) --------- */
  var DEFAULT_USER = {
    answers: {
      goal: "long-term", children: "yes", monogamy: "strictly",
      smoking: "never", religion: "none", distance: "city",
      ageMin: 27, ageMax: 38,
      living: "alone", work: "flexible", pets: "love",
      politics: "liberal", freetime: "active-outdoors"
    },
    importance: {
      goal: 5, children: 4, monogamy: 5, smoking: 4, religion: 3,
      distance: 2, age: 3, living: 1, work: 3, pets: 2, politics: 3, freetime: 2
    },
    redFlags: {}
  };

  /* ---- scoring core (pure, deterministic, no DOM) ----------------------- */
  function isRedFlagged(cand, user) {
    // hard-exclusion screen: any red-flagged item value the candidate holds
    for (var item in user.redFlags) {
      var flagged = user.redFlags[item];
      if (!flagged || !flagged.length) continue;
      if (item === "age") {
        // "strict" flag = outside age range is a hard no
        var a = cand.answers && cand.answers.age;
        if (flagsInclude(flagged, "strict") && a != null &&
            (a < (user.answers.ageMin || -Infinity) || a > (user.answers.ageMax || Infinity))) {
          return item;
        }
      } else if (cand.answers && cand.answers[item] != null &&
                 flagsInclude(flagged, String(cand.answers[item]))) {
        return item;
      }
    }
    return null;
  }

  function flagsInclude(arr, val) {
    for (var i = 0; i < arr.length; i++) if (String(arr[i]) === String(val)) return true;
    return false;
  }

  function itemMatches(item, candVal, user) {
    if (item === "age") {
      var min = user.answers.ageMin, max = user.answers.ageMax;
      return candVal >= min && candVal <= max;
    }
    return user.answers[item] != null && String(candVal) === String(user.answers[item]);
  }

  function scoreCandidate(cand, user) {
    var reason = isRedFlagged(cand, user);
    if (reason) {
      return { id: cand.id, excluded: true, reason: reason, score: null, breakdown: null };
    }

    var total = 0, matched = 0;
    var perItem = [];
    for (var item in ITEMS) {
      var candVal = cand.answers ? cand.answers[item] : null;
      if (candVal == null) continue;               // candidate didn't answer
      if (item === "age") {
        // age always evaluable (range); candidate answer required
      } else if (user.answers[item] == null) {
        continue;                                  // user hasn't answered this item
      }
      var w = user.importance[item] || 3;
      total += w;
      var m = itemMatches(item, candVal, user);
      if (m) matched += w;
      perItem.push({ item: item, candVal: candVal, userVal: user.answers[item], w: w, match: m });
    }

    var score = total > 0 ? Math.round(100 * matched / total) : 0;
    if (score < 0) score = 0;
    if (score > 100) score = 100;

    // per-category weighted contributions (for the breakdown view)
    var cats = {};
    CATEGORY_ORDER.forEach(function (c) { cats[c] = { matched: 0, total: 0, items: [] }; });
    perItem.forEach(function (p) {
      var cat = ITEMS[p.item].category;
      cats[cat].total += p.w;
      if (p.match) cats[cat].matched += p.w;
      cats[cat].items.push(p);
    });

    return {
      id: cand.id, excluded: false, score: score,
      breakdown: { dealbreakerPassed: true, total: total, matched: matched, cats: cats, perItem: perItem }
    };
  }

  function matchAll(user) {
    var scored = [], excluded = [];
    CANDIDATES.forEach(function (c) {
      var r = scoreCandidate(c, user);
      if (r.excluded) excluded.push({ id: c.id, reason: r.reason });
      else scored.push(r);
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return { scored: scored, excluded: excluded };
  }

  /* ---- browser: DOM collection + render (guarded, node-safe) ------------ */
  function qval(item) {
    var el = document.querySelector('input[name="' + item + '"]:checked');
    return el ? el.value : null;
  }
  function impval(item) {
    var el = document.querySelector('input[name="' + item + '-imp"]:checked');
    return el ? parseInt(el.value, 10) : 3;
  }
  function flagValues(item) {
    var out = [];
    var nodes = document.querySelectorAll('.flag[data-flag="' + item + '"][aria-pressed="true"]');
    for (var i = 0; i < nodes.length; i++) out.push(nodes[i].getAttribute("data-flag-value"));
    return out;
  }

  function collectUserState() {
    var answers = {}, importance = {}, redFlags = {};
    Object.keys(ITEMS).forEach(function (item) {
      importance[item] = impval(item);
      if (item === "age") {
        var minEl = document.getElementById("age-min");
        var maxEl = document.getElementById("age-max");
        answers.ageMin = minEl ? parseInt(minEl.value, 10) || 27 : 27;
        answers.ageMax = maxEl ? parseInt(maxEl.value, 10) || 38 : 38;
      } else {
        var v = qval(item);
        if (v) answers[item] = v;
      }
      var fl = flagValues(item);
      if (fl.length) redFlags[item] = fl;
    });
    return { answers: answers, importance: importance, redFlags: redFlags };
  }

  function valueLabel(item, value) {
    // read the human label back from the questionnaire chip (DOM), else raw
    try {
      var btn = document.querySelector('.flag[data-flag="' + item + '"][data-flag-value="' + value + '"]');
      if (btn && btn.parentNode) {
        var lab = btn.parentNode.querySelector(".chip__label");
        if (lab) return lab.textContent.trim();
      }
    } catch (e) {}
    return String(value);
  }

  function renderResults(user) {
    var result = matchAll(user || collectUserState());
    var byId = { scored: {}, excluded: {} };
    result.scored.forEach(function (r) { byId.scored[r.id] = r; });
    result.excluded.forEach(function (r) { byId.excluded[r.id] = r; });

    var cards = document.querySelectorAll('[data-candidate]');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var id = card.getAttribute("data-candidate");
      if (byId.excluded[id]) {
        // red-flagged candidate is ABSENT — never scored, no reason shown (private)
        card.setAttribute("hidden", "");
        continue;
      }
      card.removeAttribute("hidden");
      var scored = byId.scored[id];
      if (!scored) continue;
      var numEl = card.querySelector('[data-score-for] .match-score__num');
      var bdBody = card.querySelector('[data-breakdown-body]');
      if (numEl) numEl.textContent = String(scored.score);
      if (bdBody) bdBody.innerHTML = breakdownHTML(scored);
    }
    return result;
  }

  function breakdownHTML(r) {
    var b = r.breakdown;
    var h = [];
    h.push('<div class="breakdown__line breakdown__dealbreaker"><span class="k">Dealbreaker check</span>'
      + '<span class="flag-ok">&#10003; passed</span>'
      + '<span class="faint">no red flags matched &mdash; you clear for each other</span></div>');
    h.push('<div class="breakdown__meta">');
    h.push('<span>Total weighted overlap: <b>' + b.matched + '</b> of <b>' + b.total + '</b></span>');
    h.push('<span>Score = <b>' + r.score + '</b>/100 &middot; preference match only</span>');
    h.push('</div>');

    h.push('<div class="breakdown__cats">');
    CATEGORY_ORDER.forEach(function (cat) {
      var c = b.cats[cat];
      if (!c || !c.total) return;
      h.push('<div class="breakdown__cat">'
        + '<span class="k">' + cat + '</span>'
        + '<span><b>' + c.matched + '</b> / ' + c.total + ' weighted</span></div>');
      c.items.forEach(function (p) {
        var sign = p.match ? '&#10003;' : '&minus;' + p.w;
        var cls = p.match ? 'is-match' : 'is-miss';
        var yv = p.item === "age" ? "age in your range" : valueLabel(p.item, p.userVal);
        var cv = p.item === "age" ? String(p.candVal) : valueLabel(p.item, p.candVal);
        h.push('<div class="breakdown__item ' + cls + '">'
          + '<span>' + ITEMS[p.item].label + '</span>'
          + '<span class="delta">' + sign + '</span>'
          + '<span class="vals faint">you: ' + yv + ' &middot; them: ' + cv + ' &middot; weight ' + p.w + '</span>'
          + '</div>');
      });
    });
    h.push('</div>');

    h.push('<div class="breakdown__honesty">Preference match &mdash; '
      + 'not a chemistry or compatibility prediction. Red flags are private dealbreakers: '
      + 'a person you\'ve flagged simply never shows up, and they\'re never told.</div>');
    return h.join("");
  }

  function refresh() {
    renderResults(collectUserState());
  }

  /* ---- public API ------------------------------------------------------- */
  var api = {
    ITEMS: ITEMS,
    CATEGORY_ORDER: CATEGORY_ORDER,
    CANDIDATES: CANDIDATES,
    DEFAULT_USER: DEFAULT_USER,
    isRedFlagged: isRedFlagged,
    scoreCandidate: scoreCandidate,
    matchAll: matchAll,
    collectUserState: collectUserState,
    renderResults: renderResults,
    refresh: refresh
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.Matching = api;
  }

  /* ---- self-test (run: node matching.js --selftest) --------------------- */
  function assert(cond, msg) {
    if (!cond) { console.error("SELFTEST FAIL: " + msg); process.exitCode = 1; return false; }
    return true;
  }

  function selftest() {
    var ok = true;

    // 1. default user: no exclusions, A = perfect overlap
    var d = matchAll(DEFAULT_USER);
    ok = assert(d.excluded.length === 0, "default: unexpected exclusions " + JSON.stringify(d.excluded)) && ok;
    ok = assert(d.scored.length === 4, "default: expected 4 scored, got " + d.scored.length) && ok;
    var byId = {};
    d.scored.forEach(function (r) { byId[r.id] = r; });
    ok = assert(byId.A && byId.A.score === 100, "default: A should score 100") && ok;
    d.scored.forEach(function (r) {
      ok = assert(r.score >= 0 && r.score <= 100, r.id + " score in [0,100]: " + r.score) && ok;
    });

    // 2. flag smoking=regularly -> D excluded (never scored)
    var u2 = JSON.parse(JSON.stringify(DEFAULT_USER));
    u2.redFlags = { smoking: ["regularly"] };
    var d2 = matchAll(u2);
    ok = assert(d2.excluded.length === 1 && d2.excluded[0].id === "D" && d2.excluded[0].reason === "smoking",
      "flag smoking=regularly should exclude D") && ok;
    ok = assert(d2.scored.every(function (r) { return r.id !== "D"; }),
      "D must not be scored when red-flagged") && ok;

    // 3. flag goal=casual -> C (and D) excluded
    var u3 = JSON.parse(JSON.stringify(DEFAULT_USER));
    u3.redFlags = { goal: ["casual"] };
    var d3 = matchAll(u3);
    var ex3 = d3.excluded.map(function (e) { return e.id; }).sort();
    ok = assert(ex3.indexOf("C") !== -1 && ex3.indexOf("D") !== -1,
      "flag goal=casual should exclude C and D, got " + ex3.join(",")) && ok;

    // 4. age-strict flag excludes out-of-range C (25) and D (41) — both outside 27..38
    var u4 = JSON.parse(JSON.stringify(DEFAULT_USER));
    u4.redFlags = { age: ["strict"] };
    var d4 = matchAll(u4);
    var ex4 = d4.excluded.map(function (e) { return e.id; }).sort();
    ok = assert(ex4.join(",") === "C,D" && d4.excluded.every(function (e) { return e.reason === "age"; }),
      "flag age=strict should exclude out-of-range C and D, got " + JSON.stringify(d4.excluded)) && ok;

    // 5. clearing a flag restores the candidate (semantics: absent, not deleted)
    var u5 = JSON.parse(JSON.stringify(u2));
    u5.redFlags = {};
    var d5 = matchAll(u5);
    ok = assert(d5.scored.length === 4 && d5.excluded.length === 0,
      "clearing flags should restore all 4 candidates") && ok;

    console.log(JSON.stringify({
      selftest: ok ? "PASS" : "FAIL",
      default: { scored: d.scored.map(function (r) { return [r.id, r.score]; }), excluded: d.excluded },
      flag_smoking_regularly_excluded: d2.excluded,
      flag_goal_casual_excluded: d3.excluded,
      flag_age_strict_excluded: d4.excluded
    }));
    if (process && process.exitCode !== 1) process.exitCode = 0;
  }

  if (typeof require !== "undefined" && require.main === module) {
    if (process.argv.indexOf("--selftest") !== -1) selftest();
  }
})(typeof window !== "undefined" ? window : globalThis);
