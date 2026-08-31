/* ============================================================================
   PARTNER-002 — UI prototype (slice 7b) — state machine
   Vanilla JS only. Static, clickable states; no backend. No XHR/fetch, no
   external assets, no network. Theme toggle is the only persistence (localStorage).
   ========================================================================== */
(function () {
  "use strict";

  /* ---- view registry (the complete walkable flow) ----------------------- */
  var FLOW = [
    { id: "welcome",       label: "Welcome",    onboarding: true },
    { id: "questionnaire", label: "Questions",  onboarding: true },
    { id: "import",        label: "Your data",  onboarding: true },
    { id: "profile",       label: "Review",     onboarding: true },
    { id: "discover",      label: "Discover" },
    { id: "matches",       label: "Matches" },
    { id: "match",         label: "Match" },
    { id: "ladder",        label: "Reveal ladder" },
    { id: "safety",        label: "Safety" },
    { id: "legal",         label: "Before you join" },
    { id: "miller",        label: "Legal questions" }
  ];

  var views = {};
  FLOW.forEach(function (s) {
    views[s.id] = document.querySelector('[data-view="' + s.id + '"]');
  });

  var current = null;

  /* main-nav item that owns a given view (for highlight + reachability) */
  var NAV_OWNER = {
    discover: "discover",
    profile:  "profile",
    matches:  "matches",
    match:    "matches",
    ladder:   "matches",
    safety:   "safety",
    legal:    "legal",
    miller:   "legal"
    // welcome / import are onboarding-only (no nav owner)
  };

  /* ---- progress bar (onboarding views only) ----------------------------- */
  var progress = document.getElementById("progress");
  var ONBOARD = FLOW.filter(function (s) { return s.onboarding; });

  function renderProgress(activeId) {
    if (!progress) return;
    progress.innerHTML = "";
    var activeIdx = -1;
    ONBOARD.forEach(function (s, i) {
      if (s.id === activeId) activeIdx = i;
    });
    if (activeIdx === -1) {
      // not an onboarding view — hide the bar entirely
      progress.hidden = true;
      return;
    }
    progress.hidden = false;
    ONBOARD.forEach(function (s, i) {
      var el = document.createElement("span");
      el.className = "progress__step";
      if (i < activeIdx) el.classList.add("is-done");
      if (i === activeIdx) el.classList.add("is-current");
      var num = document.createElement("span");
      num.className = "n";
      num.textContent = String(i + 1);
      el.appendChild(num);
      el.appendChild(document.createTextNode(" " + s.label));
      progress.appendChild(el);
    });
  }

  /* ---- main-nav current-step highlight ---------------------------------- */
  function renderNav(activeId) {
    var owner = NAV_OWNER[activeId] || null;
    var items = document.querySelectorAll(".main-nav__item");
    items.forEach(function (it) {
      if (it.getAttribute("data-nav-key") === owner) {
        it.classList.add("is-current");
      } else {
        it.classList.remove("is-current");
      }
    });
  }

  function show(id) {
    for (var k in views) {
      if (views[k]) views[k].classList.remove("is-active");
    }
    var v = views[id];
    if (!v) return;
    v.classList.add("is-active");
    current = id;
    renderProgress(id);
    renderNav(id);
    window.scrollTo(0, 0);
    if (id === "safety") populateAuditLog();
    if (id === "discover") { populateExchangeNote(); if (window.Matching) window.Matching.refresh(); }
  }

  /* ---- navigation (event delegation; also honours #hash deep links) ----- */
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-nav]");
    if (el) {
      e.preventDefault();
      show(el.getAttribute("data-nav"));
    }
  });

  window.addEventListener("hashchange", function () {
    var id = location.hash.replace("#v-", "") || "welcome";
    if (views[id]) show(id);
  });

  /* ---- conditional Q2 (children) — shown iff Q1 not in {casual, undecided} */
  var Q1_NAME = "goal";
  var CHILDREN_UNAVAILABLE = ["casual", "undecided"];
  var q2Wrap = document.getElementById("q2-wrap");

  function updateConditionalQ2() {
    var checked = document.querySelector('input[name="' + Q1_NAME + '"]:checked');
    if (!checked) { q2Wrap.hidden = true; return; }
    var hide = CHILDREN_UNAVAILABLE.indexOf(checked.value) !== -1;
    q2Wrap.hidden = hide;
  }

  document.addEventListener("change", function (e) {
    if (e.target && e.target.name === Q1_NAME) updateConditionalQ2();
    if (window.Matching) window.Matching.refresh();
  });
  updateConditionalQ2();

  /* ---- red-flag toggles (slice 7c) — per-choice, private hard exclusions */
  function countFlagged(item) {
    var nodes = document.querySelectorAll('.flag[data-flag="' + item + '"]');
    var flagged = 0, total = 0;
    nodes.forEach(function (n) {
      total++;
      if (n.getAttribute("aria-pressed") === "true") flagged++;
    });
    return { flagged: flagged, total: total };
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".flag[data-flag]");
    if (!btn) return;
    var item = btn.getAttribute("data-flag");
    var pressed = btn.getAttribute("aria-pressed") === "true";

    if (!pressed) {
      var c = countFlagged(item);
      // validation: cannot flag ALL choices of one item — at least one stays unflagged
      if (c.total > 1 && c.flagged >= c.total - 1) {
        toast("Red flags can't cover every answer &mdash; leave at least one choice un-flagged.");
        return;
      }
      btn.setAttribute("aria-pressed", "true");
    } else {
      btn.setAttribute("aria-pressed", "false");
    }
    if (window.Matching) window.Matching.refresh();
  });

  /* ---- candidate interest/decline + mutual match ------------------------ */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-interest]");
    if (!btn) return;
    var card = document.querySelector('[data-candidate="' + btn.getAttribute("data-interest") + '"]');
    var action = btn.getAttribute("data-action");
    if (!card) return;

    if (action === "interested") {
      if (card.dataset.mutual === "true") {
        flashMutual(card);
        toast("You both said yes &mdash; it's a match!");
        setTimeout(function () { show("match"); }, 900);
      } else {
        setInterestState(card, "awaiting", "Yes sent &mdash; waiting on their answer");
        toast("Yes sent. One-sided interest is never shown to the other side.");
      }
    } else if (action === "decline") {
      card.classList.add("is-declined");
      setInterestState(card, "declined", "Declined &mdash; no one is told");
      toast("Declined. The other side is never told.");
    } else if (action === "skip") {
      toast("Skipped for now.");
    }
  });

  function setInterestState(card, state, txt) {
    var st = card.querySelector('[data-state]');
    if (!st) return;
    st.className = "interest-state";
    if (state === "mutual") st.classList.add("is-mutual");
    var t = st.querySelector(".txt");
    if (t) t.textContent = txt;
  }

  function flashMutual(card) {
    setInterestState(card, "mutual", "You both said yes");
    card.classList.add("is-matched");
  }

  /* ---- report control (files into human-supervised escalation queue) ---- */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-report]");
    if (!btn) return;
    var target = btn.getAttribute("data-report");
    toast("Report filed to a human reviewer (" + target + "). Demo &mdash; nothing actually happens.");
  });

  /* ---- unmatch (silent + symmetric) -------------------------------------- */
  document.addEventListener("click", function (e) {
    if (!e.target.closest("#unmatch")) return;
    toast("Unmatched. Silent both ways &mdash; neither of you is told.");
    setTimeout(function () { show("discover"); }, 900);
  });

  /* ---- derived signal chips — tap to remove (demo) ----------------------- */
  document.addEventListener("click", function (e) {
    var chip = e.target.closest(".chip-tag");
    if (!chip) return;
    var label = chip.getAttribute("data-signal") || "signal";
    chip.remove();
    toast("Removed \"" + label + "\". Easy as that.");
  });

  /* ---- import dropzone (mock) -------------------------------------------- */
  var dropzone = document.getElementById("dropzone");
  var importLog = document.getElementById("import-log");
  var derived = document.getElementById("derived-signals");

  function runMockImport() {
    importLog.hidden = false;
    derived.hidden = false;
    var lines = [
      "Takeout archive opened (demo &mdash; nothing really parsed).",
      "  Chrome/MyActivity.html      ... 4,102 entries",
      "  Search/MyActivity.html      ... 1,934 entries",
      "  YouTube/history.html        ... 518 entries",
      "  Maps                        ... 312 entries",
      "Parsed on-device. Raw content never leaves this machine.",
      "Found 5 topic labels + 1 rhythm signal."
    ];
    importLog.textContent = lines.join("\n");
  }
  dropzone.addEventListener("click", runMockImport);
  dropzone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); runMockImport(); }
  });
  dropzone.addEventListener("dragover", function (e) {
    e.preventDefault(); dropzone.classList.add("is-hover");
  });
  dropzone.addEventListener("dragleave", function () { dropzone.classList.remove("is-hover"); });
  dropzone.addEventListener("drop", function (e) {
    e.preventDefault(); dropzone.classList.remove("is-hover"); runMockImport();
  });

  /* ---- exchange + audit log (synthetic) ---------------------------------- */
  var auditLog = document.getElementById("audit-log");
  var exchangeNote = document.getElementById("exchange-note");

  function populateAuditLog() {
    if (!auditLog) return;
    auditLog.innerHTML = [
      "0x3f9a...  import          on-device parse            ok",
      "0x7c12...  profile         q1..q12 enums + ratings    ok",
      "0xa41e...  exchange        overlap count = 11         ok",
      "0x2b88...  match           mutual interest            ok",
      "log is append-only &mdash; nothing here gets edited."
    ].join("\n");
  }

  function populateExchangeNote() {
    // no-op placeholder: Discover has no synthetic exchange log to fill.
  }

  /* ---- toast -------------------------------------------------------------- */
  var toastEl = document.getElementById("toast");
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("is-visible");
    }, 3200);
  }

  /* ---- theme toggle ------------------------------------------------------- */
  var themeBtn = document.getElementById("theme-toggle");
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("p2-theme", theme); } catch (e) {}
  }
  themeBtn.addEventListener("click", function () {
    var cur = document.documentElement.getAttribute("data-theme");
    applyTheme(cur === "dark" ? "light" : "dark");
  });
  try {
    var saved = localStorage.getItem("p2-theme");
    if (saved) applyTheme(saved);
  } catch (e) {}

  /* ---- slice 8: terms gate (continue requires terms; consent optional) --- */
  var termsInput = document.getElementById("terms-accept");
  var legalContinue = document.getElementById("legal-continue");
  var legalGateNote = document.getElementById("legal-gate-note");
  if (legalContinue) {
    legalContinue.addEventListener("click", function () {
      if (termsInput && !termsInput.checked) {
        if (legalGateNote) {
          legalGateNote.textContent = "Please accept the draft terms of use to continue.";
          legalGateNote.classList.add("is-error");
        }
        return;
      }
      // Optional import consent may be declined — the questionnaire-only demo continues.
      // No consent checkbox is required; accepting terms never marks consent given.
      show("questionnaire");
    });
  }

  /* ---- slice 8: withdrawal / delete demo profile (demo behavior) ------------- */
  var withdrawn = false;
  function withdrawConsent() {
    if (withdrawn) return;
    withdrawn = true;
    document.querySelectorAll("[data-withdraw-status]").forEach(function (el) { el.hidden = false; });
    var pool = document.querySelector("[data-pool-status]");
    if (pool) pool.hidden = false;
    document.querySelectorAll("[data-interest],#unmatch").forEach(function (b) { b.disabled = true; });
    toast("Withdrawn (demo). Agent exchange stopped; your profile left the pool. Real deletion is counsel-gated.");
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest("#withdraw") || e.target.closest("#withdraw-safety")) withdrawConsent();
  });

  /* ---- boot --------------------------------------------------------------- */
  var start = (location.hash ? location.hash.replace("#v-", "") : "welcome");
  show(views[start] ? start : "welcome");
})();
