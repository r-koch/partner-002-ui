/* ============================================================================
   PARTNER-002 — UI prototype (slice 9) — questionnaire renderer
   ----------------------------------------------------------------------------
   Pure, deterministic function that turns questionnaire.json `items` into the
   questionnaire field-group HTML. No DOM access, no network, no external data —
   so it runs identically in the browser (via app.js) and under Node (for the
   gate self-tests). Vanilla only.

   This is the SINGLE place item markup is produced. index.html's questionnaire
   section is an empty render target; there is no hardcoded item markup to drift
   from the JSON.
   ========================================================================== */
(function (root) {
  "use strict";

  /* ---- mark-up tokens ---------------------------------------------------- */
  var ICON_YOU = "&#128101;";   // About you
  var ICON_SEEK = "&#127919;";  // Looking for
  var ICON_FLAG = "&#9873;";    // red-flag
  var FLAG_TITLE = "Red flag \u2014 this answer never matches: anyone answering it stays hidden from you. Private.";
  var FLAG_TXT = "flag";
  var RANGE_FLAG_TXT = "outside range = never";

  /* ---- text escaping (labels/hints are owner-editable; trust nothing) ---- */
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escAttr(s) {
    return esc(s).replace(/"/g, "&quot;");
  }

  /* ---- small builders ---------------------------------------------------- */
  function flagButton(id, value, title) {
    return '<button class="flag" type="button" data-flag="' + escAttr(id) + '" data-flag-value="' + escAttr(value) + '"'
      + ' aria-pressed="false" title="' + escAttr(title) + '">'
      + '<span class="flag__icon">' + ICON_FLAG + '</span>'
      + '<span class="flag__txt">' + FLAG_TXT + '</span></button>';
  }

  function rangeFlagButton(id, title) {
    return '<button class="flag flag--item" type="button" data-flag="' + escAttr(id) + '" data-flag-value="strict"'
      + ' aria-pressed="false" title="' + escAttr(title) + '">'
      + '<span class="flag__icon">' + ICON_FLAG + '</span>'
      + '<span class="flag__txt">' + RANGE_FLAG_TXT + '</span></button>';
  }

  function importanceHTML(id, ariaLabel, def) {
    var h = '<div class="importance" role="radiogroup" aria-label="' + escAttr(ariaLabel) + '">'
      + '<span class="importance__label">How much does this matter?</span>';
    for (var i = 1; i <= 5; i++) {
      var checked = (i === def) ? " checked" : "";
      h += '<label class="importance"><input type="radio" name="' + escAttr(id) + '-imp" value="' + i + '"' + checked + '>'
        + '<span class="importance__dot">' + i + '</span></label>';
    }
    return h + '</div>';
  }

  /* ---- option rows ------------------------------------------------------- */
  function youOption(name, opt) {
    var checked = opt.checked ? " checked" : "";
    return '<label class="chip"><input type="radio" name="' + escAttr(name) + '" value="' + escAttr(opt.value) + '"' + checked + '>'
      + '<span class="chip__label">' + esc(opt.label) + '</span></label>';
  }

  function seekOption(id, opt, redflag, isMulti) {
    var type = isMulti ? "checkbox" : "radio";
    var checked = opt.checked ? " checked" : "";
    var labeled = '<label class="chip"><input type="' + type + '" name="' + escAttr(id) + '" value="' + escAttr(opt.value) + '"' + checked + '>'
      + '<span class="chip__label">' + esc(opt.label) + '</span></label>';
    // option.redflag === false suppresses the flag button (only "Any" on gender)
    var flagged = (redflag && opt.redflag !== false);
    if (!flagged) return labeled;
    return '<span class="choice">' + labeled + flagButton(id, opt.value, FLAG_TITLE) + '</span>';
  }

  /* ---- you side ---------------------------------------------------------- */
  function youSection(id, you, youName) {
    var out = "";
    if (you.type === "number") {
      var required = you.required ? " required" : "";
      out = '<input type="number" id="' + escAttr(id) + '" name="' + escAttr(id) + '"'
        + ' min="' + you.min + '" max="' + you.max + '"' + required + ' inputmode="numeric"'
        + ' aria-label="' + escAttr(you.ariaLabel) + '">';
      if (you.hint) out += '<div class="field-hint">' + esc(you.hint) + '</div>';
      return out;
    }
    // radio
    out = '<div class="chip-row">';
    you.options.forEach(function (opt) { out += youOption(youName, opt); });
    out += '</div>';
    if (you.hint) out += '<div class="field-hint">' + esc(you.hint) + '</div>';
    return out;
  }

  /* ---- seek side --------------------------------------------------------- */
  function seekSection(id, seek) {
    var out = "";
    if (seek.type === "range") {
      out = rangeSection(id, seek);
    } else {
      var isMulti = seek.type === "multi";
      out = '<div class="chip-row">';
      seek.options.forEach(function (opt) { out += seekOption(id, opt, !!seek.redflag, isMulti); });
      out += '</div>';
      if (seek.hint) out += '<div class="field-hint">' + esc(seek.hint) + '</div>';
    }
    if (seek.importance) out += importanceHTML(id, seek.importanceAriaLabel || "how much this matters", seek.importanceDefault || 3);
    return out;
  }

  function rangeSection(id, seek) {
    var h = '<div class="range-minmax">';
    h += '<input type="number" id="' + escAttr(id) + '-min" name="' + escAttr(id) + '-min"'
      + ' min="' + seek.min + '" max="' + seek.max + '" inputmode="numeric"'
      + (seek.minDefault != null ? ' value="' + seek.minDefault + '"' : '')
      + (seek.minPlaceholder ? ' placeholder="' + escAttr(seek.minPlaceholder) + '"' : '')
      + ' aria-label="' + escAttr(seek.minAriaLabel) + '">';
    h += '<span class="muted">to</span>';
    h += '<input type="number" id="' + escAttr(id) + '-max" name="' + escAttr(id) + '-max"'
      + ' min="' + seek.min + '" max="' + seek.max + '" inputmode="numeric"'
      + (seek.maxDefault != null ? ' value="' + seek.maxDefault + '"' : '')
      + (seek.maxPlaceholder ? ' placeholder="' + escAttr(seek.maxPlaceholder) + '"' : '')
      + ' aria-label="' + escAttr(seek.maxAriaLabel) + '">';
    if (seek.unit) h += '<span class="muted">(' + esc(seek.unit) + ')</span>';
    h += rangeFlagButton(id, seek.rangeFlagTitle || FLAG_TITLE);
    h += '</div>';
    if (seek.hint) {
      h += '<div class="field-hint" data-hint-for="' + escAttr(id) + '" data-default-text="' + escAttr(seek.hint) + '">' + esc(seek.hint) + '</div>';
    }
    return h;
  }

  /* ---- one whole item ---------------------------------------------------- */
  function buildItem(item, n) {
    var both = item.axis === "both";
    // symmetric items share the id across both sides, so the About-you name gets
    // a "-you" suffix; you-only items (freetime, your-age) keep the plain id, which
    // is exactly the name matching.js reads back by.
    var youName = both ? item.id + "-you" : item.id;
    var attrs = 'class="field-group" data-question="' + escAttr(item.id) + '" data-axis="' + item.axis + '"';
    if (item.conditional) {
      attrs = 'class="field-group conditional-q" data-question="' + escAttr(item.id) + '" data-axis="' + item.axis + '"'
        + ' data-conditional="' + escAttr(item.conditional.when) + '"'
        + ' data-show-unless="' + item.conditional.showUnless.join(",") + '"';
    }
    var out = '<div ' + attrs + '>';

    if (both) {
      out += '<span class="field-label">' + n + '. ' + esc(item.label) + '</span>';
      out += '<div class="axis-side axis-side--you" data-axis="you">';
      out += '<span class="axis__tag axis__tag--you">' + ICON_YOU + ' About you</span>';
      out += youSection(item.id, item.you, youName);
      out += '</div>';
      out += '<div class="axis-side axis-side--seek" data-axis="seek">';
      out += '<span class="axis__tag axis__tag--seek">' + ICON_SEEK + ' Looking for</span>';
      out += seekSection(item.id, item.seek);
      out += '</div>';
    } else if (item.axis === "you") {
      out += '<span class="axis__tag axis__tag--you">' + ICON_YOU + ' About you</span>';
      out += '<span class="field-label">' + n + '. ' + esc(item.label) + '</span>';
      out += youSection(item.id, item.you, youName);
    } else { // seek
      out += '<span class="axis__tag axis__tag--seek">' + ICON_SEEK + ' Looking for</span>';
      out += '<span class="field-label">' + n + '. ' + esc(item.label) + '</span>';
      out += seekSection(item.id, item.seek);
    }

    if (item.hint) out += '<div class="field-hint">' + esc(item.hint) + '</div>';
    out += '</div>';
    return out;
  }

  function build(items) {
    var out = "";
    for (var i = 0; i < items.length; i++) {
      out += buildItem(items[i], i + 1);
    }
    return out;
  }

  var api = { build: build, buildItem: buildItem };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.QuestionnaireRender = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
