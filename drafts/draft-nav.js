/* PARTNER-002 draft navigator — shared prev/next arrows across all draft pages.
   Injects a fixed bottom bar with left/right arrows + a page counter. No emojis. */
(function () {
  var SEQUENCE = [
    "draft-00-entry.html",
    "draft-01a-welcome.html",
    "draft-01-signup-18plus.html",
    "draft-01b-terms.html",
    "draft-01c-privacy.html",
    "draft-01d-consent-sensitive.html",
    "draft-01e-consent-avatar.html",
    "draft-01f-handle.html",
    "draft-02-01-gender.html",
    "draft-02-02-age.html",
    "draft-02-03-height.html",
    "draft-02-04-body-type.html",
    "draft-02-05-relationship-style.html",
    "draft-02-06-kids-now.html",
    "draft-02-07-want-kids.html",
    "draft-02-08-smoking.html",
    "draft-02-09-religion.html",
    "draft-02-10-location.html",
    "draft-02-11-living.html",
    "draft-02-12-work.html",
    "draft-02-13-pets.html",
    "draft-02-14-politics.html",
    "draft-02-15-freetime.html",
    "draft-02-16-orientation.html",
    "draft-04d-import.html",
    "draft-04e-interests-manual.html",
    "draft-03-questionnaire-overview.html",
    "draft-03b-decision-gate.html",
    "draft-04-candidate-list.html",
    "draft-05-matches-list.html",
    "draft-07-match-stage1.html",
    "draft-08-match-rung3.html",
    "draft-09-icebreaker-pair.html",
    "draft-02-17-sun-sign.html",
    "draft-02-18-four-letter-style.html",
    "draft-02-19-big-five.html",
    "draft-09b-icebreaker-result.html",
    "draft-06a-history.html",
    "draft-06b-extended-qa.html",
    "draft-06c-extended.html",
    "draft-06d-deep.html",
    "draft-04a-safety.html",
    "draft-04f-pricing.html",
    "draft-04c-faq.html",
    "draft-04g-settings.html",
    "draft-04h-avatar-create.html",
    "draft-04i-menu.html"
  ];
  var here = location.pathname.split("/").pop() || "draft-01a-welcome.html";
  var idx = SEQUENCE.indexOf(here);
  if (idx < 0) return; // not a draft page — do nothing

  var prev = idx > 0 ? SEQUENCE[idx - 1] : null;
  var next = idx < SEQUENCE.length - 1 ? SEQUENCE[idx + 1] : null;

  var bar = document.createElement("div");
  bar.id = "draft-nav";
  bar.style.cssText = "position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:998;" +
    "display:flex;align-items:center;gap:6px;background:var(--surface,#F3EBDD);" +
    "border:1px solid var(--line,#D8CCBA);border-radius:999px;padding:6px 10px;" +
    "box-shadow:0 2px 8px rgba(0,0,0,.12);font-family:Georgia,serif;";

  function arrow(label, target, enabled) {
    var a = document.createElement("a");
    a.textContent = label;
    a.href = target;
    a.style.cssText = "text-decoration:none;font-size:18px;line-height:1;padding:6px 12px;" +
      "border-radius:50%;color:" + (enabled ? "var(--text,#2E2620)" : "#999") + ";" +
      "background:" + (enabled ? "var(--bg,#FAF6EF)" : "transparent") + ";" +
      "border:1px solid " + (enabled ? "var(--line,#D8CCBA)" : "transparent") + ";" +
      "cursor:" + (enabled ? "pointer" : "default") + ";user-select:none;";
    if (!enabled) a.style.pointerEvents = "none";
    return a;
  }

  var counter = document.createElement("span");
  counter.textContent = (idx + 1) + " / " + SEQUENCE.length;
  counter.style.cssText = "font-size:12px;color:var(--muted,#6B5D50);padding:0 4px;min-width:44px;text-align:center;";

  bar.appendChild(arrow("\u2039", prev, !!prev));
  bar.appendChild(counter);
  bar.appendChild(arrow("\u203A", next, !!next));

  document.body.appendChild(bar);
  // keep bottom content clear of the fixed bar
  document.body.style.paddingBottom = "70px";
})();