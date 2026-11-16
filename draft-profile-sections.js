/* Shared profile section: the Introduction detail middle section, also used as the
   Pairing "Profile & activities" view (Alternative A). Renders into #profile-root.
   Prototype only: mock data, tab-local state, no network. */
(function () {
  "use strict";

  var css = [
    "[hidden]{display:none !important;}",
    ".lastact{display:flex;align-items:center;gap:8px;margin:0 18px 12px;padding:9px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface);font-size:13px;color:var(--text);text-decoration:none;}",
    ".ldot{width:8px;height:8px;border-radius:50%;background:var(--match);flex:none;}",
    ".ltext{flex:1;min-width:0;}",
    ".lbtn{font-size:12px;color:var(--accent);white-space:nowrap;}",
    ".sec{margin:0 18px 12px;border:1px solid var(--line);border-radius:14px;background:var(--surface);padding:0 14px;}",
    ".sechead{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:12px 0;background:none;border:none;font:inherit;color:var(--text);text-align:left;}",
    "button.sechead{cursor:pointer;}",
    "button.sechead::after{content:'+';font-size:16px;color:var(--muted);}",
    "button.sechead[aria-expanded='true']::after{content:'\\2212';}",
    ".sectitle{font-size:14px;font-weight:600;}",
    ".secsum{font-size:12px;color:var(--muted);}",
    ".secbody{padding:0 0 10px;}",
    ".crow{display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--line);font-size:13px;}",
    ".mark{width:8px;height:8px;border-radius:50%;flex:none;}",
    ".mark.same{background:var(--match);}",
    ".mark.diff{border:1.5px solid var(--muted);}",
    ".clabel{flex:1;min-width:0;}",
    ".pips{display:flex;gap:3px;flex:none;}",
    ".pip{width:5px;height:5px;border-radius:50%;background:var(--line);}",
    ".pip.on{background:var(--muted);}",
    ".cpts{width:30px;text-align:right;flex:none;color:var(--muted);}",
    ".chips{display:flex;flex-wrap:wrap;gap:6px;padding-bottom:10px;}",
    ".chip{font-size:12px;padding:4px 10px;border-radius:999px;border:1.5px solid var(--line);background:var(--bg);color:var(--muted);}",
    ".chip.shared{border-color:var(--match);background:rgba(62,107,79,.12);color:var(--match);}",
    ".qcols{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;padding:2px 0 4px;}",
    ".qrow{padding:9px 0;border-top:1px solid var(--line);}",
    ".qtop{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px;}",
    ".qtier{font-size:11px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:1px 8px;flex:none;}",
    ".qpair{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;}",
    ".chipq{font-size:12px;padding:5px 8px;border-radius:9px;text-align:center;border:1.5px solid var(--line);background:var(--bg);}",
    ".chipq.same{border-color:var(--match);color:var(--match);background:rgba(62,107,79,.10);}",
    ".chipq.diff{border-color:var(--accent);color:var(--accent);}",
    ".chipq.empty{border-style:dashed;color:var(--muted);}",
    ".qact{display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:6px;}",
    ".actbtn{font-family:inherit;font-size:12px;padding:5px 12px;border-radius:999px;border:1.5px solid var(--line);background:var(--bg);color:var(--text);cursor:pointer;}",
    ".actbtn.pos{background:var(--positive);border-color:var(--positive);color:var(--positive-text);}",
    ".actbtn:disabled{opacity:.5;cursor:default;}",
    ".waitlbl{font-size:12px;color:var(--muted);}",
    ".wrow{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 0;border-top:1px solid var(--line);font-size:13px;color:var(--text);text-decoration:none;}",
    ".addrow{display:flex;justify-content:flex-end;padding:6px 0 12px;}"
  ].join("\n");

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var params = new URLSearchParams(window.location.search);
  var THEIRS_DECLARED = params.get("theirs") !== "0";  /* ?theirs=0 shows the ask state */
  var MINE_DECLARED = params.get("mine") !== "0";      /* ?mine=0 routes to the interest page first */

  var MY_INTERESTS = ["travel", "outdoors", "food", "photography"];
  var THEIR_INTERESTS = ["travel", "outdoors", "photography", "music", "films"];

  var WEIGHTS = {
    "Gender": 3, "Age": 4, "Height": 1, "Body type": 2, "Relationship style": 5,
    "Have kids": 3, "Want kids": 5, "Smoking": 3, "Religion": 1, "Location": 4,
    "Who do you live with?": 2, "Work rhythm": 2, "Have pets now?": 2, "Want pets?": 2,
    "Politics — rough direction": 1, "Free-time style": 4, "Orientation": 2
  };
  /* same pair as the Candidates card: these two topics differ */
  var DIFF = ["Smoking", "Free-time style"];

  function scale100(weights) {
    var keys = Object.keys(weights);
    var total = keys.reduce(function (a, k) { return a + weights[k]; }, 0);
    var raw = keys.map(function (k) { return weights[k] / total * 100; });
    var out = raw.map(Math.floor);
    var rem = raw.map(function (v, i) { return v - out[i]; });
    var need = 100 - out.reduce(function (a, b) { return a + b; }, 0);
    var order = keys.map(function (k, i) { return i; })
      .sort(function (a, b) { return rem[b] - rem[a] || a - b; });
    for (var j = 0; j < need; j++) out[order[j]] += 1;
    var scaled = {};
    keys.forEach(function (k, i) { scaled[k] = out[i]; });
    return scaled;
  }
  var POINTS = scale100(WEIGHTS);

  var CORE = Object.keys(WEIGHTS).map(function (label) {
    var same = DIFF.indexOf(label) === -1;
    return { label: label, w: WEIGHTS[label], same: same, pts: same ? POINTS[label] : 0 };
  });
  var SCORE = CORE.reduce(function (a, r) { return a + r.pts; }, 0);
  var SAME_COUNT = CORE.filter(function (r) { return r.same; }).length;

  var ACTIVITY = { text: "Warm-up #1 completed", ago: "2 h ago" };

  /* state: answered | incoming (they asked me) | waiting (I asked) | unasked */
  var QUESTIONS = [
    { id: "weekend-ideal", tier: "Extended", label: "Weekend ideal", you: "Outdoors", them: "Outdoors", state: "answered" },
    { id: "conflict-style", tier: "Deep", label: "Conflict style", you: "Direct", them: "Mediator", state: "answered" },
    { id: "myers-briggs", tier: "Personality", label: "Myers–Briggs type", you: "INTJ", them: "INFP", state: "answered" },
    { id: "travel-appetite", tier: "Extended", label: "Travel appetite", you: null, them: "4", state: "incoming" },
    { id: "ideal-first-date", tier: "Deep", label: "Ideal first date", you: "Coffee", them: null, state: "waiting", sentHours: 3, nudged: false },
    { id: "humor", tier: "Extended", label: "Humor", you: "Dry", them: null, state: "waiting", sentHours: 30, nudged: false },
    { id: "attachment-style", tier: "Deep", label: "Attachment style", you: null, them: null, state: "unasked" }
  ];

  var INTEREST_QS = [
    { interest: "travel", q: "Which kind of trip fits you best?", you: "Slow stay", them: "Slow stay", state: "answered" },
    { interest: "outdoors", q: "Pick your ideal hike", you: "Ridge walk", them: null, state: "waiting", sentHours: 2 }
  ];

  var WARMUPS = [
    { label: "Warm-up #1", detail: "3 of 5 same", href: "draft-09b-warmup-result.html" }
  ];

  var coreOpen = false;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  function find(id) {
    for (var i = 0; i < QUESTIONS.length; i++) if (QUESTIONS[i].id === id) return QUESTIONS[i];
    return null;
  }

  function answerPage(q) {
    if (q.tier === "Extended") return "draft-06c-extended.html?q=" + q.id;
    if (q.tier === "Deep") return "draft-06d-deep.html?q=" + q.id;
    return "draft-02-19-four-letter-style.html";
  }

  function pips(n) {
    var s = "";
    for (var i = 0; i < 5; i++) s += '<span class="pip' + (i < n ? " on" : "") + '"></span>';
    return '<span class="pips">' + s + "</span>";
  }

  function renderCore() {
    var rows = CORE.slice().sort(function (a, b) {
      return b.w - a.w || a.label.localeCompare(b.label);
    });
    var list = rows.map(function (r) {
      return '<div class="crow"><span class="mark ' + (r.same ? "same" : "diff") + '"></span>' +
        '<span class="clabel">' + esc(r.label) + "</span>" + pips(r.w) +
        '<span class="cpts">' + (r.same ? "+" + r.pts : "0") + "</span></div>";
    }).join("");
    return '<section class="sec">' +
      '<button class="sechead" data-action="toggle-core" aria-expanded="' + coreOpen + '">' +
      '<span class="sectitle">Core compatibility</span>' +
      '<span class="secsum">' + SAME_COUNT + " same · " + (CORE.length - SAME_COUNT) + " different</span></button>" +
      '<div class="secbody"' + (coreOpen ? "" : " hidden") + ">" + list + "</div></section>";
  }

  function renderInterests() {
    var body;
    if (THEIRS_DECLARED) {
      body = '<div class="chips">' + THEIR_INTERESTS.map(function (x) {
        var shared = MY_INTERESTS.indexOf(x) !== -1;
        return '<span class="chip' + (shared ? " shared" : "") + '">' + esc(x) + "</span>";
      }).join("") + "</div>";
    } else {
      body = '<div class="addrow"><button class="actbtn" data-action="ask-interests">Ask for interests</button></div>';
    }
    return '<section class="sec"><div class="sechead"><span class="sectitle">Interests</span></div>' +
      body + "</section>";
  }

  function cells(q) {
    var both = q.you && q.them;
    var same = both && q.you.toLowerCase() === q.them.toLowerCase();
    var cls = both ? (same ? "same" : "diff") : "";
    var you = q.you ? '<span class="chipq ' + cls + '">' + esc(q.you) + "</span>"
      : '<span class="chipq empty">not answered</span>';
    var them;
    if (both) them = '<span class="chipq ' + cls + '">' + esc(q.them) + "</span>";
    else if (q.state === "incoming") them = '<span class="chipq empty">locked</span>';
    else them = '<span class="chipq empty">not answered</span>';
    return you + them;
  }

  function action(q) {
    if (q.state === "incoming") return '<button class="actbtn pos" data-action="answer-q" data-id="' + q.id + '">Answer</button>';
    if (q.state === "waiting") {
      if (q.nudged) return '<span class="waitlbl">Nudged</span>';
      if (q.sentHours >= 24) return '<button class="actbtn" data-action="nudge-q" data-id="' + q.id + '">Nudge</button>';
      return '<span class="waitlbl">Waiting · ' + q.sentHours + " h</span>";
    }
    if (q.state === "unasked") return '<button class="actbtn" data-action="ask-q" data-id="' + q.id + '">Ask</button>';
    return "";
  }

  function renderQuestions() {
    var rows = QUESTIONS.map(function (q) {
      var act = action(q);
      return '<div class="qrow"><div class="qtop"><span>' + esc(q.label) + '</span><span class="qtier">' +
        esc(q.tier) + "</span></div>" +
        '<div class="qpair">' + cells(q) + "</div>" +
        (act ? '<div class="qact">' + act + "</div>" : "") + "</div>";
    }).join("");
    return '<section class="sec"><div class="sechead"><span class="sectitle">Questions</span></div>' +
      '<div class="qcols"><span>you</span><span>them</span></div>' + rows + "</section>";
  }

  function renderWarmups() {
    var rows = WARMUPS.map(function (w) {
      return '<a class="wrow" href="' + w.href + '"><span>' + esc(w.label) +
        '</span><span class="secsum">' + esc(w.detail) + "</span></a>";
    }).join("");
    return '<section class="sec"><div class="sechead"><span class="sectitle">Warm-ups</span></div>' +
      rows + '<div class="addrow"><button class="actbtn" data-action="invite-warmup">Invite to warm-up</button></div></section>';
  }

  function renderInterestQs() {
    var rows = INTEREST_QS.map(function (iq) {
      var both = iq.you && iq.them;
      var same = both && iq.you === iq.them;
      var cls = both ? (same ? "same" : "diff") : "";
      var you = iq.you ? '<span class="chipq ' + cls + '">' + esc(iq.you) + "</span>"
        : '<span class="chipq empty">not answered</span>';
      var them = iq.them ? '<span class="chipq ' + cls + '">' + esc(iq.them) + "</span>"
        : '<span class="chipq empty">not answered</span>';
      var act = iq.state === "waiting" ? '<div class="qact"><span class="waitlbl">Waiting · ' + iq.sentHours + " h</span></div>" : "";
      return '<div class="qrow"><div class="qtop"><span>' + esc(iq.q) + '</span><span class="qtier">' +
        esc(iq.interest) + '</span></div><div class="qpair">' + you + them + "</div>" + act + "</div>";
    }).join("");
    return '<section class="sec"><div class="sechead"><span class="sectitle">Interest questions</span></div>' +
      rows + '<div class="addrow"><button class="actbtn" data-action="ask-iq">Ask an interest question</button></div></section>';
  }

  function renderAll() {
    var root = document.getElementById("profile-root");
    if (!root) return;
    root.innerHTML =
      '<a class="lastact" href="draft-06a-history.html"><span class="ldot"></span>' +
      '<span class="ltext">' + esc(ACTIVITY.text) + " · " + esc(ACTIVITY.ago) + "</span>" +
      '<span class="lbtn">Activity log ›</span></a>' +
      renderCore() + renderInterests() + renderQuestions() + renderWarmups() + renderInterestQs();
  }

  document.querySelectorAll("[data-score]").forEach(function (el) { el.textContent = String(SCORE); });

  var root = document.getElementById("profile-root");
  if (root) {
    root.addEventListener("click", function (e) {
      var t = e.target.closest("[data-action]");
      if (!t) return;
      var name = t.getAttribute("data-action");
      var q = t.getAttribute("data-id") ? find(t.getAttribute("data-id")) : null;
      if (name === "toggle-core") { coreOpen = !coreOpen; renderAll(); }
      else if (name === "ask-interests") {
        if (!MINE_DECLARED) location.href = "draft-04e-interests-manual.html";
        else t.outerHTML = '<span class="waitlbl">Waiting · just now</span>';
      }
      else if (name === "ask-q" && q) {
        if (!q.you) { location.href = answerPage(q); return; } /* answer first */
        q.state = "waiting"; q.sentHours = 0; renderAll();
      }
      else if (name === "answer-q" && q) location.href = answerPage(q);
      else if (name === "nudge-q" && q) { q.nudged = true; renderAll(); }
      else if (name === "invite-warmup") location.href = "draft-09-warmup-pair.html";
      else if (name === "ask-iq") { t.textContent = "Sent"; t.disabled = true; }
    });
    renderAll();
  }

  /* Structured suggestions only: shared interests and answered questions.
     Chat messages are never read. */
  window.P2Profile = {
    needsYou: function () {
      return QUESTIONS.filter(function (q) { return q.state === "incoming"; }).length;
    },
    suggestions: function () {
      var out = [];
      var shared = MY_INTERESTS.filter(function (x) { return THEIR_INTERESTS.indexOf(x) !== -1; });
      if (shared.length) out.push("You both like " + shared[0] + ". What is your favourite thing about it?");
      QUESTIONS.forEach(function (q) {
        if (q.you && q.them && q.you.toLowerCase() !== q.them.toLowerCase()) {
          out.push("Your answers on " + q.label.toLowerCase() + " differ. How do you handle that in practice?");
        }
      });
      INTEREST_QS.forEach(function (iq) {
        if (iq.you && iq.them && iq.you === iq.them) {
          out.push("You both picked " + iq.you.toLowerCase() + " for " + iq.interest + ". What is behind that for you?");
        }
      });
      return out.slice(0, 3);
    }
  };
})();
