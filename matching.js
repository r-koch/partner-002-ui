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
    age:       { label: "Age range",          category: "Logistics", range: true },
    height:    { label: "Height range",       category: "Logistics", range: true },
    living:    { label: "Living arrangement", category: "Lifestyle" },
    work:      { label: "Work rhythm",        category: "Lifestyle" },
    pets:      { label: "Pets",               category: "Lifestyle" },
    politics:  { label: "Politics",           category: "Values" },
    freetime:  { label: "Free-time style",    category: "Lifestyle" }
  };

  var CATEGORY_ORDER = ["Values", "Lifestyle", "Logistics"];

  /* Range-criterion bounds (free-form min/max inputs, validated in-app):
     age 18..99, height 120..250 cm. Empty bound = open end = no constraint. */
  var RANGE_BOUNDS = { age: { min: 18, max: 99 }, height: { min: 120, max: 250 } };

  /* Range criterion semantics, shared by age and height:
     - user bounds may be null/undefined = open end (no constraint on that side)
     - candidate value inside [min,max] (inclusive) matches; outside doesn't
     - no constraint at all = always passes */
  function rangeMatches(item, candVal, user) {
    if (candVal == null) return false;
    var min = user.answers[item + "Min"];
    var max = user.answers[item + "Max"];
    if (min == null && max == null) return true;   // no constraint = any value passes
    if (min != null && candVal < min) return false;
    if (max != null && candVal > max) return false;
    return true;
  }

  /* ---- synthetic candidate pool (made-up data only) --------------------- */
  var CANDIDATES = [
    { id: "A", answers: {
        goal: "long-term", children: "yes", monogamy: "strictly",
        smoking: "never", religion: "none", distance: "city", age: 29, height: 176,
        living: "alone", work: "flexible", pets: "love",
        politics: "liberal", freetime: "active-outdoors" } },
    { id: "B", answers: {
        goal: "long-term", children: "yes", monogamy: "strictly",
        smoking: "socially", religion: "christian", distance: "city", age: 34, height: 168,
        living: "alone", work: "flexible", pets: "tolerate",
        politics: "center", freetime: "homebody" } },
    { id: "C", answers: {
        goal: "casual", children: "open", monogamy: "open-relationship",
        smoking: "socially", religion: "none", distance: "regional", age: 25, height: 158,
        living: "flatmates", work: "shift", pets: "none",
        politics: "apolitical", freetime: "travel" } },
    { id: "D", answers: {
        goal: "casual", children: "no", monogamy: "undecided",
        smoking: "regularly", religion: "other", distance: "long-distance", age: 41, height: 193,
        living: "family", work: "irregular", pets: "allergic",
        politics: "conservative", freetime: "city-culture" } }
  ];

  /* ---- default user (matches the pre-checked prototype answers) --------- */
  /* Height Looking-for defaults to NO constraint (both range inputs empty):
     any height passes until the user types bounds. */
  var DEFAULT_USER = {
    answers: {
      goal: "long-term", children: "yes", monogamy: "strictly",
      smoking: "never", religion: "none", distance: "city",
      ageMin: 27, ageMax: 38,
      heightMin: null, heightMax: null,
      living: "alone", work: "flexible", pets: "love",
      politics: "liberal", freetime: "active-outdoors"
    },
    importance: {
      goal: 5, children: 4, monogamy: 5, smoking: 4, religion: 3,
      distance: 2, age: 3, height: 3, living: 1, work: 3, pets: 2, politics: 3, freetime: 2
    },
    redFlags: {}
  };

  /* ---- scoring core (pure, deterministic, no DOM) ----------------------- */
  function isRedFlagged(cand, user) {
    // hard-exclusion screen: any red-flagged item value the candidate holds
    for (var item in user.redFlags) {
      var flagged = user.redFlags[item];
      if (!flagged || !flagged.length) continue;
      if (ITEMS[item] && ITEMS[item].range) {
        // "strict" flag = outside the [min,max] range is a hard no
        var a = cand.answers && cand.answers[item];
        if (flagsInclude(flagged, "strict") && a != null && !rangeMatches(item, a, user)) {
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
    if (ITEMS[item] && ITEMS[item].range) {
      return rangeMatches(item, candVal, user);
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
      var isRange = !!(ITEMS[item] && ITEMS[item].range);
      if (isRange) {
        // range criteria (age, height): participate only when the user
        // expressed a constraint. No bounds at all = no preference on this
        // item = it is skipped (and would always pass anyway).
        if (user.answers[item + "Min"] == null && user.answers[item + "Max"] == null) {
          continue;
        }
      } else if (user.answers[item] == null) {
        continue;                                  // user hasn't answered this item
      }
      var w = user.importance[item] || 3;
      total += w;
      var m = itemMatches(item, candVal, user);
      if (m) matched += w;
      var uv = isRange
        ? { min: user.answers[item + "Min"], max: user.answers[item + "Max"] }
        : user.answers[item];
      perItem.push({ item: item, candVal: candVal, userVal: uv, w: w, match: m });
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
      if (ITEMS[item] && ITEMS[item].range) {
        // free-form min/max criterion (age, height): empty = open end = no constraint
        var minEl = document.getElementById(item + "-min");
        var maxEl = document.getElementById(item + "-max");
        var mn = minEl ? parseBound(minEl.value, RANGE_BOUNDS[item].min, RANGE_BOUNDS[item].max) : null;
        var mx = maxEl ? parseBound(maxEl.value, RANGE_BOUNDS[item].min, RANGE_BOUNDS[item].max) : null;
        // pair-level sanity: a crossed range (min > max) is invalid — the UI
        // marks it and shows an error; until fixed it scores as NO constraint
        // (same as empty), never as "matches nobody".
        if (mn != null && mx != null && mn > mx) { mn = null; mx = null; }
        answers[item + "Min"] = mn;
        answers[item + "Max"] = mx;
      } else {
        var v = qval(item);
        if (v) answers[item] = v;
      }
      var fl = flagValues(item);
      if (fl.length) redFlags[item] = fl;
    });
    return { answers: answers, importance: importance, redFlags: redFlags };
  }

  /* Parse one range bound. Returns an integer within [lo,hi], or null when the
     field is empty / non-numeric / out of bounds (invalid input is treated as
     no constraint on that end; the UI marks it invalid and tells the user). */
  function parseBound(raw, lo, hi) {
    var t = typeof raw === "string" ? raw.trim() : raw;
    if (t == null || t === "") return null;
    var n = parseInt(t, 10);
    if (isNaN(n) || n < lo || n > hi) return null;
    return n;
  }

  /* DOM-side validation of one free-form range pair (age, height).
     Returns { valid: bool, errors: [..] } and toggles .is-invalid on the
     inputs + hint. Empty fields are always fine (no constraint). */
  function validateRangeInputs(item) {
    var minEl = document.getElementById(item + "-min");
    var maxEl = document.getElementById(item + "-max");
    var hintEl = document.querySelector('.field-hint[data-hint-for="' + item + '"]');
    if (!minEl || !maxEl) return { valid: true, errors: [] };
    var b = RANGE_BOUNDS[item];
    var errors = [];
    var mn = minEl.value.trim();
    var mx = maxEl.value.trim();
    var mnN = mn === "" ? null : parseInt(mn, 10);
    var mxN = mx === "" ? null : parseInt(mx, 10);
    if (mn !== "" && (isNaN(mnN) || mnN < b.min || mnN > b.max)) {
      errors.push("min must be a number between " + b.min + " and " + b.max);
    }
    if (mx !== "" && (isNaN(mxN) || mxN < b.min || mxN > b.max)) {
      errors.push("max must be a number between " + b.min + " and " + b.max);
    }
    if (errors.length === 0 && mnN != null && mxN != null && mnN > mxN) {
      errors.push("min must not be greater than max");
    }
    minEl.classList.toggle("is-invalid", errors.length > 0 && mn !== "");
    maxEl.classList.toggle("is-invalid", errors.length > 0 && mx !== "");
    if (hintEl) {
      hintEl.classList.toggle("is-error", errors.length > 0);
      if (errors.length > 0) {
        hintEl.textContent = "Check your range: " + errors.join("; ") + ".";
      } else {
        hintEl.textContent = hintEl.getAttribute("data-default-text") || hintEl.textContent;
      }
    }
    return { valid: errors.length === 0, errors: errors };
  }

  function heightRangeValid() { return validateRangeInputs("height"); }
  function ageRangeValid() { return validateRangeInputs("age"); }

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
        var isRange = !!(ITEMS[p.item] && ITEMS[p.item].range);
        var yv, cv;
        if (isRange) {
          var rmin = p.userVal && p.userVal.min, rmax = p.userVal && p.userVal.max;
          yv = (rmin == null && rmax == null) ? "no preference"
            : (rmin == null ? "up to " + rmax : (rmax == null ? rmin + " or more" : rmin + "&ndash;" + rmax))
            + (p.item === "height" ? " cm" : "");
          cv = String(p.candVal) + (p.item === "height" ? " cm" : "");
        } else {
          yv = valueLabel(p.item, p.userVal);
          cv = valueLabel(p.item, p.candVal);
        }
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
    // validate free-form range pairs (age, height) before scoring; invalid
    // entries are marked in the UI and treated as open ends (no constraint)
    if (typeof document !== "undefined") {
      Object.keys(RANGE_BOUNDS).forEach(function (item) { validateRangeInputs(item); });
    }
    renderResults(collectUserState());
  }

  /* ---- public API ------------------------------------------------------- */
  var api = {
    ITEMS: ITEMS,
    CATEGORY_ORDER: CATEGORY_ORDER,
    RANGE_BOUNDS: RANGE_BOUNDS,
    CANDIDATES: CANDIDATES,
    DEFAULT_USER: DEFAULT_USER,
    isRedFlagged: isRedFlagged,
    rangeMatches: rangeMatches,
    parseBound: parseBound,
    itemMatches: itemMatches,
    scoreCandidate: scoreCandidate,
    matchAll: matchAll,
    collectUserState: collectUserState,
    validateRangeInputs: validateRangeInputs,
    heightRangeValid: heightRangeValid,
    ageRangeValid: ageRangeValid,
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

    // 1. default user (height unconstrained): no exclusions, A = perfect overlap
    var d = matchAll(DEFAULT_USER);
    ok = assert(d.excluded.length === 0, "default: unexpected exclusions " + JSON.stringify(d.excluded)) && ok;
    ok = assert(d.scored.length === 4, "default: expected 4 scored, got " + d.scored.length) && ok;
    var byId = {};
    d.scored.forEach(function (r) { byId[r.id] = r; });
    ok = assert(byId.A && byId.A.score === 100, "default: A should score 100") && ok;
    d.scored.forEach(function (r) {
      ok = assert(r.score >= 0 && r.score <= 100, r.id + " score in [0,100]: " + r.score) && ok;
    });
    // height unconstrained => item skipped, breakdown has no height line
    var aBreak = byId.A.breakdown;
    ok = assert(aBreak.perItem.every(function (p) { return p.item !== "height"; }),
      "default: height with no constraint must not appear in the breakdown") && ok;

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

    // 6. height range semantics — free-form min/max (like age)
    // 6a. [165,180]: A(176) B(168) inside; C(158) D(193) outside
    var u6 = JSON.parse(JSON.stringify(DEFAULT_USER));
    u6.answers.heightMin = 165; u6.answers.heightMax = 180;
    var d6 = matchAll(u6);
    ok = assert(d6.excluded.length === 0, "6a: height range alone never excludes (score only)") && ok;
    var hA = d6.scored.filter(function (r) { return r.id === "A"; })[0];
    var hB = d6.scored.filter(function (r) { return r.id === "B"; })[0];
    var hC = d6.scored.filter(function (r) { return r.id === "C"; })[0];
    var hD = d6.scored.filter(function (r) { return r.id === "D"; })[0];
    function heightLine(r) {
      var l = r.breakdown.perItem.filter(function (p) { return p.item === "height"; });
      return l.length ? l[0] : null;
    }
    ok = assert(heightLine(hA) && heightLine(hA).match === true, "6a: A 176cm inside [165,180] matches") && ok;
    ok = assert(heightLine(hB) && heightLine(hB).match === true, "6a: B 168cm inside [165,180] matches") && ok;
    ok = assert(heightLine(hC) && heightLine(hC).match === false, "6a: C 158cm outside [165,180] misses") && ok;
    ok = assert(heightLine(hD) && heightLine(hD).match === false, "6a: D 193cm outside [165,180] misses") && ok;

    // 6b. boundaries are inclusive: [158,193] => everyone matches
    var u6b = JSON.parse(JSON.stringify(DEFAULT_USER));
    u6b.answers.heightMin = 158; u6b.answers.heightMax = 193;
    var d6b = matchAll(u6b);
    ok = assert(d6b.scored.every(function (r) {
      var l = heightLine(r); return l && l.match === true;
    }), "6b: inclusive bounds — 158 and 193 both match at the edges") && ok;

    // 6c. open ends: min only, max only
    var u6c = JSON.parse(JSON.stringify(DEFAULT_USER));
    u6c.answers.heightMin = 170; u6c.answers.heightMax = null;
    var d6c = matchAll(u6c);
    var c170 = { A: true, B: false, C: false, D: true };   // A176, B168, C158, D193
    d6c.scored.forEach(function (r) {
      var l = heightLine(r);
      ok = assert(l && l.match === c170[r.id], "6c: min-only 170+ — " + r.id + " expected " + c170[r.id]) && ok;
    });
    var u6d = JSON.parse(JSON.stringify(DEFAULT_USER));
    u6d.answers.heightMin = null; u6d.answers.heightMax = 175;
    var d6d = matchAll(u6d);
    var c175 = { A: false, B: true, C: true, D: false };
    d6d.scored.forEach(function (r) {
      var l = heightLine(r);
      ok = assert(l && l.match === c175[r.id], "6d: max-only <=175 — " + r.id + " expected " + c175[r.id]) && ok;
    });

    // 6e. no constraint at all = always passes + skipped from the score
    var u6e = JSON.parse(JSON.stringify(DEFAULT_USER));
    u6e.answers.heightMin = null; u6e.answers.heightMax = null;
    var d6e = matchAll(u6e);
    ok = assert(d6e.scored.every(function (r) { return !heightLine(r); }),
      "6e: no height constraint = no height line (always passes, skipped)") && ok;

    // 6f. height-strict red flag = outside range never matches (hard exclusion)
    var u6f = JSON.parse(JSON.stringify(DEFAULT_USER));
    u6f.answers.heightMin = 165; u6f.answers.heightMax = 180;
    u6f.redFlags = { height: ["strict"] };
    var d6f = matchAll(u6f);
    var ex6f = d6f.excluded.map(function (e) { return e.id; }).sort();
    ok = assert(ex6f.join(",") === "C,D" && d6f.excluded.every(function (e) { return e.reason === "height"; }),
      "6f: height=strict should exclude out-of-range C and D, got " + JSON.stringify(d6f.excluded)) && ok;

    // 6g. height-strict with NO range set = no-op (nothing to be outside of)
    var u6g = JSON.parse(JSON.stringify(DEFAULT_USER));
    u6g.redFlags = { height: ["strict"] };
    var d6g = matchAll(u6g);
    ok = assert(d6g.excluded.length === 0,
      "6g: height=strict with no range must exclude nobody") && ok;

    // 6h. parseBound: empty/non-numeric/out-of-bounds -> null; valid -> int
    ok = assert(api.parseBound("", 120, 250) === null, "6h: parseBound('') -> null") && ok;
    ok = assert(api.parseBound("  ", 120, 250) === null, "6h: parseBound(blank) -> null") && ok;
    ok = assert(api.parseBound("abc", 120, 250) === null, "6h: parseBound('abc') -> null") && ok;
    ok = assert(api.parseBound("119", 120, 250) === null, "6h: parseBound below bound -> null") && ok;
    ok = assert(api.parseBound("251", 120, 250) === null, "6h: parseBound above bound -> null") && ok;
    ok = assert(api.parseBound("165", 120, 250) === 165, "6h: parseBound('165') -> 165") && ok;
    ok = assert(api.parseBound(" 176 ", 120, 250) === 176, "6h: parseBound trims -> 176") && ok;
    ok = assert(api.rangeMatches("height", 176, { answers: { heightMin: null, heightMax: null } }) === true,
      "6h: rangeMatches no constraint -> true") && ok;
    ok = assert(api.rangeMatches("height", 176, { answers: { heightMin: 180, heightMax: null } }) === false,
      "6h: rangeMatches below min -> false") && ok;

    console.log(JSON.stringify({
      selftest: ok ? "PASS" : "FAIL",
      default: { scored: d.scored.map(function (r) { return [r.id, r.score]; }), excluded: d.excluded },
      flag_smoking_regularly_excluded: d2.excluded,
      flag_goal_casual_excluded: d3.excluded,
      flag_age_strict_excluded: d4.excluded,
      height_range_165_180: d6.scored.map(function (r) {
        var l = heightLine(r); return [r.id, r.score, l ? l.match : "skipped"];
      }),
      height_strict_excluded: d6f.excluded
    }));
    if (process && process.exitCode !== 1) process.exitCode = 0;
  }

  if (typeof require !== "undefined" && require.main === module) {
    if (process.argv.indexOf("--selftest") !== -1) selftest();
  }
})(typeof window !== "undefined" ? window : globalThis);
