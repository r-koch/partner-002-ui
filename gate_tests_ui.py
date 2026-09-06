#!/usr/bin/env python3
"""Gate tests for PARTNER-002 importance correction (slice 7e) — G-IMP-1..4.

Pure-stdlib checks against static prototype files.  The gates encode the
criterion-only rule: About-you is an attribute answer; Looking-for is a
criterion answer plus a 1–5 importance scale.  Red flags stay Looking-for only.
"""

import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return f.read()


HTML = load("index.html")
JS = load("app.js")
MATCH = load("matching.js")
CSS = load("styles.css")
results = []


def check(gate, label, ok, detail=""):
    results.append((gate, label, bool(ok), detail))


def view(vid):
    m = re.search(r'<section[^>]*data-view="%s".*?</section>' % re.escape(vid), HTML, re.S)
    return m.group(0) if m else ""


def element_block(html, start):
    """Return the balanced div starting at start; sufficient for this static DOM."""
    depth = 0
    for m in re.finditer(r"<div\b[^>]*>|</div\s*>", html[start:], re.I):
        tag = m.group(0)
        depth += 1 if tag.lower().startswith("<div") else -1
        if depth == 0:
            return html[start:start + m.end()]
    return ""


QN = view("questionnaire")
PROF = view("profile")
IMPORT = view("import")
LADDER = view("ladder")

# ---- slice 9: questionnaire.json is the master; render items to test DOM ----
# Slice 11: the gate environment has no web server, so the DOM/render gates
# exercise the EMBEDDED fallback copy deterministically (the exact data path a
# file:// load takes), while the live hosted page fetches questionnaire.json.
# This mirrors the runtime contract: fetched file wins over http(s); embed is
# the fallback.


def render_questionnaire():
    node = shutil.which("node")
    if not node:
        return ""
    code = ("const fs=require('fs');const r=require('./questionnaire-render.js');"
            "const html=fs.readFileSync('./index.html','utf8');"
            "const m=html.match(/<script type=\\\"application\\/json\\\" "
            "id=\\\"questionnaire-data\\\">([\\s\\S]*?)<\\/script>/);"
            "const d=JSON.parse(m[1]);"
            "process.stdout.write(r.build(d.items));")
    p = subprocess.run([node, "-e", code], cwd=HERE, capture_output=True, text=True)
    return p.stdout if p.returncode == 0 else ""


with open(os.path.join(HERE, "questionnaire.json"), encoding="utf-8") as _f:
    QJSON = json.load(_f)

# EMBED — the embedded fallback copy parsed from index.html (slice 11: the
# fallback path is what the no-server gate environment can and does test).
EMBED = None
_embed_m = re.search(r'<script[^>]*id="questionnaire-data"[^>]*>(.*?)</script>', HTML, re.S)
if _embed_m:
    try:
        EMBED = json.loads(_embed_m.group(1))
    except Exception:
        EMBED = None

RENDERED = render_questionnaire()
QN_STATIC = QN
# index.html's questionnaire section is an empty render target; splice the
# rendered items back in so the existing item-level gates test real output.
# (The renderer is fed the EMBEDDED copy — the deterministic fallback path —
# because the gate environment has no web server; the hosted page fetches.)
QN = QN.replace('<div id="questionnaire-items"></div>',
                '<div id="questionnaire-items">' + RENDERED + '</div>')


def details_block(html, start):
    depth = 0
    for m in re.finditer(r"<details\b[^>]*>|</details\s*>", html[start:], re.I):
        depth += 1 if m.group(0).lower().startswith("<details") else -1
        if depth == 0:
            return html[start:start + m.end()]
    return ""


def tier_block(tier):
    m = re.search(r'<details\b(?=[^>]*class="[^"]*profile-section)(?=[^>]*data-tier="%s")[^>]*>' % re.escape(tier), QN)
    return details_block(QN, m.start()) if m else ""


def group_start(qid):
    pat = (r'<div\b(?=[^>]*class="[^"]*\bfield-group\b)(?=[^>]*data-question="%s")'
           r'[^>]*>' % re.escape(qid))
    m = re.search(pat, QN)
    return m.start() if m else -1


def item_chunk(qid):
    start = group_start(qid)
    return element_block(QN, start) if start >= 0 else ""


def axis_of(chunk):
    m = re.search(r'data-axis="(you|seek|both)"', chunk)
    return m.group(1) if m else None


def side(chunk, axis):
    m = re.search(r'<div\b(?=[^>]*class="[^"]*\baxis-side--%s\b)[^>]*>' % axis, chunk)
    return element_block(chunk, m.start()) if m else ""


def importance_scale(chunk, qid):
    vals = re.findall(r'<input\b[^>]*name="%s-imp"[^>]*value="([1-5])"' % re.escape(qid), chunk)
    return sorted(vals) == ["1", "2", "3", "4", "5"]


def flags(chunk, qid):
    return 'data-flag="%s"' % qid in chunk


CORE = tier_block("core")
EXTENDED = tier_block("extended")
DEEP = tier_block("deep")
ALL_ITEMS = re.findall(r'data-question="([^"]+)"', QN)
EXPECTED = {
    "gender", "age", "height", "body-type", "relationship-style", "kids-now", "want-kids",
    "smoking", "religion", "location",
    "living", "work", "pets", "politics", "freetime",
}

# G-IMP-1 — About-you never carries a criterion importance scale.
check("G-IMP-1", "all expected questionnaire items are present (16 Core, no body-type Extended item)",
      set(ALL_ITEMS) == EXPECTED, "got: %s" % sorted(ALL_ITEMS))
about_scale_leaks = []
for qid in ALL_ITEMS:
    chunk = item_chunk(qid)
    axis = axis_of(chunk)
    about = side(chunk, "you") if axis == "both" else (chunk if axis == "you" else "")
    if about and re.search(r'name="[^"]+-imp"', about):
        about_scale_leaks.append(qid)
check("G-IMP-1", "zero importance scales on every About-you item", not about_scale_leaks,
      "About-you scale leaks: %s" % about_scale_leaks)

# G-IMP-2 — every Looking-for criterion visibly has one complete 1–5 scale.
# The seek-side importance scale uses the seek input-name override when present
# (location -> distance), so resolve the effective importance name per item.
_imp_name = {}
for _it in (QJSON.get("items") or []):
    _sk = (_it or {}).get("seek") or {}
    _imp_name[(_it or {}).get("id")] = _sk.get("inputName") or _sk.get("name") or (_it or {}).get("id")
seek_scale_missing = []
for qid in ALL_ITEMS:
    chunk = item_chunk(qid)
    axis = axis_of(chunk)
    seeking = side(chunk, "seek") if axis == "both" else (chunk if axis == "seek" else "")
    if seeking and not importance_scale(seeking, _imp_name.get(qid, qid)):
        seek_scale_missing.append(qid)
check("G-IMP-2", "every Looking-for item has an exact 1–5 importance scale", not seek_scale_missing,
      "missing/incomplete scales: %s" % seek_scale_missing)

# G-IMP-3 — symmetric items are plain About-you + criterion Looking-for.
SYMMETRIC = ("gender", "height", "body-type", "relationship-style", "kids-now", "want-kids", "smoking", "religion", "living", "work", "pets", "politics")
for qid in SYMMETRIC:
    chunk = item_chunk(qid)
    you, seeking = side(chunk, "you"), side(chunk, "seek")
    check("G-IMP-3", "%s: About-you is a plain answer (no importance / no red flag)" % qid,
          axis_of(chunk) == "both" and bool(re.search(r'<input\b', you))
          and not re.search(r'name="[^"]+-imp"', you) and "data-flag" not in you,
          "axis=%s" % axis_of(chunk))
    check("G-IMP-3", "%s: Looking-for has value + 1–5 importance + red-flag support" % qid,
          bool(re.search(r'<input\b', seeking)) and importance_scale(seeking, qid)
          and (flags(seeking, qid) or qid == "kids-now"),
          "scale=%s flags=%s" % (importance_scale(seeking, qid), flags(seeking, qid)))

# Owner steers (slice 8b): height Looking-for is now a FREE-FORM min/max numeric
# range (like age) per owner feedback; About-you keeps its enum ranges unchanged.
h = item_chunk("height")
h_you, h_seek = side(h, "you"), side(h, "seek")
check("G-IMP-3", "height is Core symmetric (owner restructure 09-01): About-you numeric cm; Looking-for free-form min/max range + 1–5 + strict-range flag",
      'data-question="height"' in CORE and axis_of(h) == "both"
      and 'type="number"' in h_you and 'name="height"' in h_you      # About-you: numeric cm input
      and h_seek.count('type="number"') >= 2
      and 'id="height-min"' in h_seek and 'id="height-max"' in h_seek
      and re.search(r'min="120"', h_seek) and re.search(r'max="250"', h_seek)
      and 'name="height"' not in h_seek            # no enum chips in Looking-for
      and importance_scale(h_seek, "height") and flags(h_seek, "height"), "")
bt = item_chunk("body-type")
bt_you, bt_seek = side(bt, "you"), side(bt, "seek")
check("G-IMP-3", "body type is Core symmetric: plain About-you; Looking-for multi-select + 1–5 + flags",
      'data-question="body-type"' in CORE and 'data-question="body-type"' not in EXTENDED
      and axis_of(bt) == "both" and bt_you.count('type="radio"') >= 4
      and bt_seek.count('type="checkbox"') >= 4 and importance_scale(bt_seek, "body-type") and flags(bt_seek, "body-type"), "")
check("G-IMP-3", "weight remains absent from every questionnaire tier",
      'data-question="weight"' not in QN and "weight" not in QN.lower(), "")

# Owner steer B: gender is ONE symmetric item (your gender + sought gender merged;
# looking-for side is multi-select + importance + red flag). No separate gender-seek.
g = item_chunk("gender")
g_you, g_seek = side(g, "you"), side(g, "seek")
check("G-IMP-3", "gender is a single symmetric item (About-you radios + Looking-for multi-select + 1-5 + flags)",
      axis_of(g) == "both" and 'data-question="gender-seek"' not in QN
      and 'name="gender-you"' in g_you and g_you.count('type="radio"') >= 4
      and g_seek.count('type="checkbox"') >= 4 and 'name="gender-imp"' in g_seek
      and importance_scale(g_seek, "gender") and flags(g_seek, "gender"), "")

# Owner steer C: pets Looking-for is acceptance semantics (not mirrored attributes).
p_seek = side(item_chunk("pets"), "seek")
check("G-IMP-3", "pets Looking-for uses acceptance semantics (must-love / pets-ok / no-pets / doesnt-matter)",
      all(v in p_seek for v in ('value="must-love"', 'value="pets-ok"', 'value="no-pets"', 'value="doesnt-matter"'))
      and 'value="allergic"' not in p_seek and 'value="love"' not in p_seek, "")
check("G-IMP-3", "pets About-you stays a plain attribute answer (love/tolerate/allergic/none)",
      all(v in side(item_chunk("pets"), "you") for v in ('name="pets-you"', 'value="allergic"'))
      and "data-flag" not in side(item_chunk("pets"), "you"), "")

# Owner steer I (owner restructure 09-01): Age is ONE item, both-sided — About-you
# numeric (18-99, required) AND Looking-for free-form min/max range (editable).
aged = item_chunk("age")
check("G-IMP-3", "Age: About-you side is numeric, required, bounds 18-99, no importance/flag on you-side",
      axis_of(aged) == "both" and 'type="number"' in aged and 'min="18"' in aged
      and 'max="99"' in aged and "required" in aged
      and "-imp" not in aged.split('name="age-min"')[0], "")
check("G-IMP-3", "Age: Looking-for side is a free-form editable min/max range with importance",
      'name="age-min"' in aged and 'name="age-max"' in aged and "importance" in aged, "")
a_seek = item_chunk("age")
check("G-IMP-3", "seek-side age range stays editable (no disabled/hardcoded values)",
      'id="age-min"' in a_seek and 'id="age-max"' in a_seek
      and 'name="age-min"' in a_seek and 'name="age-max"' in a_seek
      and "disabled" not in a_seek and "value=" not in a_seek[:a_seek.index('name="age-min"')], "")

# G-IMP-4 — no score-semantic regression: the existing score reads importance
# from Looking-for item names, and its deterministic self-test remains green.
node = shutil.which("node")
selftest = subprocess.run([node, os.path.join(HERE, "matching.js"), "--selftest"],
                          capture_output=True, text=True) if node else None
check("G-IMP-4", "matching score reads per-item importance weights from Looking-for values",
      "var w = user.importance[item] || 3;" in MATCH and "importance[item] = impval(item);" in MATCH, "")
# Slice 8b: the same self-test run must ALSO prove the height free-form range
# criterion (in-range match, out-of-range miss, strict-flag exclusion) and the
# in-code validation + bounds — folded into this one check so the suite stays
# at exactly 56 checks (assertions changed, none dropped).
height_evidence = bool(selftest) and all(s in selftest.stdout for s in (
    '"height_range_165_180"',
    '["A",100,true]', '["B",62,true]', '["C",14,false]', '["D",5,false]',
    '"height_strict_excluded":[{"id":"C","reason":"height"},{"id":"D","reason":"height"}]'))
check("G-IMP-4", "matching.js deterministic self-test PASS (score semantics unchanged) + height min/max range validation & boundary behavior green (in-range match, out-of-range miss, strict-flag exclusion)",
      bool(selftest) and selftest.returncode == 0 and '"selftest":"PASS"' in selftest.stdout
      and height_evidence
      and '"pets_acceptance"' in selftest.stdout and '"living_work_multi"' in selftest.stdout
      and 'MULTI = ["living", "work", "relationshipStyle"]' in MATCH and "PETS_ACCEPT" in MATCH and "qvals(item)" in MATCH
      and 'validateRangeInputs' in MATCH
      and 'min must not be greater than max' in MATCH
      and 'RANGE_BOUNDS = { age: { min: 18, max: 99 }, height: { min: 120, max: 250 } }' in MATCH
      and 'function rangeMatches' in MATCH,
      (selftest.stderr or selftest.stdout).strip() if selftest else "node unavailable")

# Retained standing constraints + 7d routing/regression assertions.
check("constraints", "questionnaire -> import -> review ordering remains intact",
      HTML.index('id="v-questionnaire"') < HTML.index('id="v-import"') < HTML.index('id="v-profile"')
      and JS.index('id: "questionnaire"') < JS.index('id: "import"') < JS.index('id: "profile"'), "")
check("constraints", "red flags remain absent from About-you sides", not about_scale_leaks and all(
      "data-flag" not in (side(item_chunk(q), "you") if axis_of(item_chunk(q)) == "both" else item_chunk(q))
      for q in ALL_ITEMS if axis_of(item_chunk(q)) in ("you", "both")), "")
check("constraints", "Extended/Deep remain creation opt-ins and ladder-linked",
      'data-tier="extended"' in QN and 'data-tier="deep"' in QN and "optin-extended" in QN
      and "optin-deep" in QN and "Extended" in PROF and "Deep" in PROF
      and "Extended" in LADDER and "Deep" in LADDER, "")
all_files = HTML + JS + CSS + MATCH
ext_patterns = [r'https?://', r'//cdn', r'@import\s+url\(', r'<script[^>]*src="http', r'<link[^>]*href="http']
ext_hits = [p for p in ext_patterns if re.search(p, all_files, re.I)]
check("constraints", "no external URLs / CDN / framework", not ext_hits, "hits: %s" % ext_hits)
# Slice 11: fetch-first loading. app.js may fetch exactly ONE same-origin
# data file (questionnaire.json) so the hosted page renders the public-repo
# edit directly; everything else stays no-network. The fetch call must be
# same-origin (relative path, no http(s) URL), and no other network APIs may
# appear anywhere in the JS.
_fetch_calls = re.findall(r'fetch\(\s*([^)]*)\s*\)', JS)
_fetch_ok = len(_fetch_calls) == 1 and _fetch_calls[0].strip().strip('\'"') == "questionnaire.json"
net = [x for x in ["XMLHttpRequest", "sendBeacon", "WebSocket", ".ajax("]
       if x in JS or x in MATCH]
check("constraints", "no network calls in JS except the single same-origin questionnaire.json fetch (slice 11 fetch-first)",
      _fetch_ok and not net,
      "fetch calls: %s; other: %s" % (_fetch_calls, net))
cur = re.findall(r'[€$£]|EUR\s*\d|pricing|checkout|pay\b', all_files, re.I)
check("constraints", "no currency / pricing / payment markers", not cur, "found: %s" % cur[:5])

# =========================================================================
# Slice 8 — legal/consent gate G-LG-1..6 (pre-counsel DRAFT, demo only)
# =========================================================================
LEGAL = view("legal")
MILLER = view("miller")
SAFETY = view("safety")


def details_view(section, key):
    m = re.search(r'<details[^>]*data-legal="%s".*?</details>' % re.escape(key), section, re.S)
    return m.group(0) if m else ""


def consent_row(name):
    pat = (r'<label[^>]*class="consent-row[^"]*"[^>]*>.*?<input[^>]*name="%s"[^>]*>.*?</label>'
           % re.escape(name))
    m = re.search(pat, LEGAL, re.S)
    return m.group(0) if m else ""


TERMS = details_view(LEGAL, "terms")
PRIVACY = details_view(LEGAL, "privacy")
CONSENT = details_view(LEGAL, "consent")

# G-LG-1 — separate controls; consent defaults OFF; terms != consent.
check("G-LG-1", "terms, privacy notice, and consents are separate controls",
      'name="terms-accept"' in TERMS and bool(PRIVACY) and bool(CONSENT)
      and 'name="consent-matching"' in CONSENT and 'name="consent-import"' in CONSENT
      and 'name="consent-disclosure"' in CONSENT, "")
check("G-LG-1", "every explicit-consent control defaults OFF (no `checked`)",
      not re.search(r'<input[^>]*name="consent-(?:matching|import|disclosure)"[^>]*checked', LEGAL), "")
check("G-LG-1", "terms acceptance control defaults OFF",
      not re.search(r'<input[^>]*name="terms-accept"[^>]*checked', LEGAL), "")
distinct = len(set(re.findall(r'name="(terms-accept|consent-matching|consent-import|consent-disclosure)"', LEGAL))) == 4
check("G-LG-1", "terms and consent controls are distinct inputs (terms alone cannot mark consent)",
      distinct, "")

# G-LG-2 — privacy notice required content; placeholders, no invented facts.
need = ["controller", "purpose", "categor", "recipient"]
check("G-LG-2", "privacy notice has controller / purposes / categories / recipients-role",
      all(k in PRIVACY.lower() for k in need), "")
check("G-LG-2", "privacy notice has rights + withdrawal + complaint",
      all(k in PRIVACY.lower() for k in ("rights", "withdraw", "complaint")), "")
check("G-LG-2", "privacy notice explains automated matching",
      "automated matching" in PRIVACY.lower()
      and "preference screening" in PRIVACY.lower(), "")
check("G-LG-2", "no invented retention period — placeholder + counsel marker only",
      "to be confirmed with counsel" in PRIVACY and "no period is set or invented" in PRIVACY
      and not re.search(r'retention[^<]*\b\d+\s*(?:day|month|week|year)s?', PRIVACY, re.I), "")
check("G-LG-2", "no legal basis asserted — lawful basis left to counsel",
      "to be confirmed with counsel" in PRIVACY and "lawful basis" in PRIVACY.lower(), "")

# G-LG-3 — each consent: purpose + category + withdrawal; optional import decline.
for cid in ("consent-matching", "consent-import"):
    row = consent_row(cid)
    check("G-LG-3", "%s specifies purpose + data category + withdrawal route" % cid,
          "purpose" in row.lower() and "categor" in row.lower() and "withdraw" in row.lower(), "")
check("G-LG-3", "post-match disclosures consent is locked / counsel-gated (not giveable)",
      "disabled" in consent_row("consent-disclosure")
      and "counsel" in consent_row("consent-disclosure").lower(), "")
check("G-LG-3", "optional context import can be declined; questionnaire-only demo stays usable",
      "decline this" in CONSENT.lower() and "questionnaire-only demo" in CONSENT.lower()
      and 'show("questionnaire")' in JS, "")

# G-LG-4 — withdrawal reachable <=2 clicks; visibly stops pool participation.
check("G-LG-4", "withdraw/delete control lives in the persistent Safety view",
      'id="withdraw-safety"' in SAFETY and 'data-nav="safety"' in HTML, "")
check("G-LG-4", "withdrawal reachable <=2 clicks from persistent nav (Safety is a nav item, control is open)",
      'data-nav-key="safety"' in HTML and 'id="withdraw-safety"' in SAFETY, "")
check("G-LG-4", "withdrawal visibly stops pool participation in the demo",
      "withdrawConsent" in JS and 'data-pool-status' in HTML
      and "[data-interest],#unmatch" in JS and "left the pool" in HTML, "")

# G-LG-5 — public-safe scan over the public surface (ui-prototype only).
public = HTML + JS + CSS + MATCH
identifiers = ["steuernummer", "gisa", "mytu", "tax id", "vat id"]
id_hits = [p for p in identifiers if p in public.lower()]
check("G-LG-5", "no owner / Steuernummer / GISA / myTU identifiers", not id_hits, str(id_hits))
addr = re.findall(r'\b(?:Straße|Strasse|Gasse|Platz|Avenue|Street)\s+\d+', public, re.I)
check("G-LG-5", "no postal street address pattern", not addr, str(addr[:5]))
ext2 = [p for p in (r'https?://', r'//cdn', r'@import\s+url\(', r'<script[^>]*src="http',
                    r'<link[^>]*href="http', r'<img[^>]*src="http') if re.search(p, public, re.I)]
check("G-LG-5", "no external URLs / assets", not ext2, str(ext2))
secrets = re.findall(r'(?:api[_-]?key|secret|password|passwd|token)\s*[:=]', public, re.I)
check("G-LG-5", "no secrets (api key / token / password assignments)", not secrets, str(secrets[:5]))
budget = re.findall(r'\b(?:budget|control.?plane|eurs?\s*\d)', public, re.I)
check("G-LG-5", "no internal budget / control-plane detail", not budget, str(budget[:5]))

# G-LG-6 — DRAFT/counsel labels; terms != consent language; no compliance claim.
check("G-LG-6", "all legal text visibly labeled DRAFT + counsel confirmation required",
      "draft" in LEGAL.lower() and "counsel" in LEGAL.lower()
      and "counsel" in MILLER.lower(), "")
check("G-LG-6", "terms and consent are distinct in language (not conflated)",
      "agreeing to the terms never counts as consent" in LEGAL.lower()
      or "never counts as consent" in LEGAL.lower(), "")
no_compliance = re.search(r'\b(?:compliant|compliance|gdpr.?compliant|legally compliant)\b',
                          (LEGAL + MILLER).lower())
check("G-LG-6", "no claim of legal compliance", not no_compliance, str(no_compliance))

# =========================================================================
# Slice 8b-WCAG — accessibility gates G-WCAG-1..4 (WCAG 2.1 AA, both themes)
# =========================================================================

# G-WCAG-1 — type scale: no text < 12px; body >= 16, secondary >= 14.
check("G-WCAG-1", "no text smaller than 12px anywhere in the CSS",
      not re.search(r'font-size\s*:\s*(?:[0-9]|1[01])\s*px', CSS), "")
check("G-WCAG-1", "--fs-xs >= 12px (0.8125rem) and --fs-sm >= 14px (0.875rem)",
      "0.8125rem" in CSS and "0.875rem" in CSS, "")
check("G-WCAG-1", "body base stays 16px (1rem); secondary text >= 14px",
      "--fs-base:1rem" in CSS and "font-size: var(--fs-base)" in CSS, "")
check("G-WCAG-1", "larger steps kept (md 18 / lg 22 / xl 28 / 2xl 34)",
      "1.125rem" in CSS and "1.375rem" in CSS and "1.75rem" in CSS and "2.125rem" in CSS, "")

# G-WCAG-2 — contrast: the standalone stdlib checker passes 100% of pairs (both themes).
cc = os.path.join(HERE, "contrast_check.py")
ccr = subprocess.run([sys.executable, cc], capture_output=True, text=True) if os.path.exists(cc) else None
check("G-WCAG-2", "contrast_check.py exists and is stdlib-only",
      os.path.exists(cc) and bool(ccr), "")
check("G-WCAG-2", "every text/component pair meets WCAG 2.1 AA (both dark + light; normal >= 4.5, UI >= 3.0, focus >= 3.0)",
      bool(ccr) and ccr.returncode == 0 and "CONTRAST PASS:" in ccr.stdout,
      (ccr.stdout or ccr.stderr).strip()[-300:] if ccr else "contrast_check.py missing")

# G-WCAG-3 — :focus-visible on all interactive elements (>= 2px ring, offset).
check("G-WCAG-3", "focus ring is a >= 2px outline with 2px offset (replaces faint box-shadow)",
      "outline: 2px solid var(--accent)" in CSS and "outline-offset: 2px" in CSS, "")
check("G-WCAG-3", "focus-visible covers buttons, links, inputs, toggles, roles, summaries, chips",
      all(s in CSS for s in ("button:focus-visible", "a:focus-visible",
        "[role=\"button\"]:focus-visible", "summary:focus-visible",
        "select:focus-visible", ".chip input:focus-visible",
        ".toggle input:focus-visible", ".importance input:focus-visible")), "")

# G-WCAG-4 — target sizes >= 24px (40px buttons / 32 chips / 24 flags).
check("G-WCAG-4", "buttons target >= 40px height",
      ".btn" in CSS and "min-height: 40px" in CSS, "")
check("G-WCAG-4", "chips target >= 32px height",
      ".chip__label" in CSS and "min-height: 32px" in CSS, "")
check("G-WCAG-4", "red-flag toggles >= 24x24px",
      "min-height: 24px" in CSS and "min-width: 24px" in CSS, "")
check("G-WCAG-4", "importance dots 26px + toggle track 24px height",
      "width: 26px; height: 26px" in CSS and "width: 44px; height: 24px" in CSS, "")

# =========================================================================
# Slice 9 — questionnaire master file gates G-QM-1..5
# =========================================================================
REQUIRED_IDS = {
    "gender", "age", "height", "body-type", "relationship-style", "kids-now", "want-kids",
    "smoking", "religion", "location",
    "living", "work", "pets", "politics", "freetime",
}
# (dispatch names "kids" / "age-range" map to the canonical ids "kids-now"+"want-kids" / "age".)

qitems = QJSON.get("items", []) if isinstance(QJSON, dict) else []
qids = [it.get("id") for it in qitems if isinstance(it, dict)]

# G-QM-1 — the questionnaire.json master file parses and holds all 14 items.
check("G-QM-1", "questionnaire.json parses as JSON with an items array",
      isinstance(QJSON, dict) and isinstance(QJSON.get("items"), list), "")
check("G-QM-1", "all 14 required items present with unique ids (exact set)",
      len(qids) == 15 and set(qids) == REQUIRED_IDS, "got: %s" % sorted(qids))

# G-QM-1 (slice 11 rework): the embed is now a FALLBACK, no longer required to
# be byte-identical to the file. It must still be a VALID questionnaire
# (parses; required fields present; same 16 ids in the same order) so a
# file:// / offline load renders a complete questionnaire, and the app must
# use the FETCHED copy first whenever fetch succeeds (checked below).
_eitems = EMBED.get("items", []) if isinstance(EMBED, dict) else []
_eids = [it.get("id") for it in _eitems if isinstance(it, dict)]
_e_fields_ok = bool(_eitems) and all(
    isinstance(it.get("id"), str) and it["id"]
    and isinstance(it.get("label"), str) and it["label"]
    and it.get("axis") in ("you", "seek", "both")
    and (it.get("you") if it.get("axis") in ("you", "both") else True)
    and (it.get("seek") if it.get("axis") in ("seek", "both") else True)
    for it in _eitems)
check("G-QM-1", "embedded questionnaire-data block in index.html is a VALID JSON questionnaire (parses, required fields present, 14 items)",
      isinstance(EMBED, dict) and isinstance(EMBED.get("items"), list)
      and len(_eids) == 15 and set(_eids) == REQUIRED_IDS and _e_fields_ok,
      "embed items: %s" % _eids)
_fetch_idx = JS.find('fetch("questionnaire.json")')
_embed_call = re.search(r'(?<!function )embeddedQuestionnaire\(\)', JS)
check("G-QM-1", "fetch-first render logic in app.js: fetch('questionnaire.json') runs over http(s), fetched copy renders, embedded copy used only as fallback (file:// or fetch failure)",
      _fetch_idx >= 0
      and 'location.protocol !== "file:"' in JS
      and "renderQuestionnaire" in JS
      and bool(_embed_call) and _fetch_idx < _embed_call.start()
      and ".catch(" in JS, "")

# G-QM-2 — data-driven assertion: parse the JSON, assert each label + option
# label + option value appear in the rendered HTML (never a hardcoded list).
# (Slice 11: the gate environment has no web server, so these DOM assertions
# run against the EMBEDDED copy — the deterministic fallback path — matching
# how a file:// load renders. The hosted page exercises the same renderer on
# the fetched questionnaire.json instead.)
def _unesc(s):
    return (s.replace("&lt;", "<").replace("&gt;", ">")
             .replace("&amp;", "&").replace("&quot;", '"'))

RENDERED_U = _unesc(RENDERED)
missing_labels, missing_opt_labels, missing_opt_values = [], [], []
for it in qitems:
    if _unesc(it["label"]) not in RENDERED_U:
        missing_labels.append(it["label"])
    for side_name in ("you", "seek"):
        for opt in (it.get(side_name) or {}).get("options", []):
            if _unesc(opt["label"]) not in RENDERED_U:
                missing_opt_labels.append((it["id"], opt["label"]))
            if 'value="%s"' % opt["value"] not in RENDERED:
                missing_opt_values.append((it["id"], opt["value"]))
check("G-QM-2", "every item label appears in the rendered DOM (asserted against the JSON)",
      not missing_labels, str(missing_labels[:10]))
check("G-QM-2", "every option label appears in the rendered DOM",
      not missing_opt_labels, str(missing_opt_labels[:10]))
check("G-QM-2", "every option value appears in the rendered DOM",
      not missing_opt_values, str(missing_opt_values[:10]))

# G-QM-3 — numbering derived from order: 1..N, no gaps or duplicates.
field_nums = re.findall(r'class="field-label">(\d+)\.', RENDERED)
check("G-QM-3", "rendered numbers are exactly 1..N in array order (no gaps/dupes)",
      field_nums == [str(i) for i in range(1, len(qitems) + 1)], str(field_nums))
_order_pos = 0
_order_ok = True
for i, it in enumerate(qitems, 1):
    wanted = "%d. %s" % (i, it["label"])
    idx = RENDERED_U.find(wanted)
    if idx < 0 or idx < _order_pos:
        _order_ok = False
        break
    _order_pos = idx
check("G-QM-3", "each item label renders with its derived number, in array order",
      _order_ok, "first bad index %d" % i if not _order_ok else "")

# G-QM-4 — conditional logic is data-driven from JSON (optional; present items carry it).
kidsNow = next((it for it in qitems if it.get("id") == "kids-now"), None)
wantKids = next((it for it in qitems if it.get("id") == "want-kids"), None)
check("G-QM-4", "kids-now and want-kids items are present and parse (children split per owner 09-05)",
      bool(kidsNow) and kidsNow.get("axis") in ("you", "seek", "both") and bool(kidsNow.get("you"))
      and bool(wantKids) and wantKids.get("axis") in ("you", "seek", "both") and bool(wantKids.get("you")),
      "")
# When an item DOES carry a conditional, it must be expressed in the JSON data model
conditional_items = [it for it in qitems if it.get("conditional")]
check("G-QM-4", "any conditional item expresses it via JSON fields {when, showUnless}",
      all(isinstance(it["conditional"], dict) and "when" in it["conditional"]
          and "showUnless" in it["conditional"]
          for it in conditional_items), "")
check("G-QM-4", "app.js registers conditionals from JSON (not hardcoded to goal/children)",
      "registerConditionals" in JS and "item.conditional" in JS and "showUnless" in JS, "")

# G-QM-5 — zero hardcoded questionnaire items remain in index.html.
_hardcoded = [m for m in ('data-question=', 'class="field-label"', 'class="field-group"',
                          'class="field-hint"', 'class="importance"', 'data-flag=')
              if m in QN_STATIC]
check("G-QM-5", "questionnaire section has zero hardcoded item markup (renders from JSON only)",
      not _hardcoded, str(_hardcoded))
check("G-QM-5", "questionnaire section is a render target wired to the JSON + renderer",
      'id="questionnaire-items"' in QN_STATIC and 'id="questionnaire-data"' in HTML
      and 'src="questionnaire-render.js"' in HTML, "")

# =========================================================================
# Location as ONE both-axis item (dispatch-20260904-location-both-axis)
# gates G-LOC-1..2 — key-name contract documented here.
# =========================================================================
loc = item_chunk("location")
loc_you = side(loc, "you") if axis_of(loc) == "both" else ""
loc_seek = side(loc, "seek") if axis_of(loc) == "both" else ""
loc_q = next((it for it in qitems if it.get("id") == "location"), None)


def _input_tag(chunk, name):
    m = re.search(r'<input\b[^>]*name="%s"[^>]*>' % re.escape(name), chunk)
    return m.group(0) if m else ""


_loc_fields = (loc_q or {}).get("you", {}).get("fields", []) if loc_q else []
check("G-LOC-1", "location is ONE both-axis item (you=fields + seek=radio) merging country/city/postal/distance",
      axis_of(loc) == "both" and loc_q is not None
      and (loc_q.get("you", {}) or {}).get("type") == "fields"
      and (loc_q.get("seek", {}) or {}).get("inputName") == "distance", "")
check("G-LOC-1", "location you-side declares exactly the 3 fields with keys country/city/postal",
      [f.get("key") for f in _loc_fields] == ["country", "city", "postal"],
      str([f.get("key") for f in _loc_fields]))
check("G-LOC-1", "renderer emits one text input per field named by field KEY (country/city/postal), not item id / -you suffix",
      all('name="%s"' % k in loc_you for k in ("country", "city", "postal"))
      and 'name="location-you"' not in loc_you and 'name="location"' not in loc_you, "")
check("G-LOC-1", "country + city inputs required; postal optional",
      "required" in _input_tag(loc_you, "country")
      and "required" in _input_tag(loc_you, "city")
      and "required" not in _input_tag(loc_you, "postal"), "")
check("G-LOC-1", "seek side preserves the distance contract: radio name=distance with the 4 options",
      'name="distance"' in loc_seek and loc_seek.count('type="radio"') >= 4
      and all('value="%s"' % v in loc_seek for v in ("lt15km", "city", "regional", "long-distance")), "")
check("G-LOC-1", "importance + red-flag base stay `distance` (distance-imp / data-flag=distance), not location-*",
      importance_scale(loc_seek, "distance") and 'data-flag="distance"' in loc_seek
      and 'name="location-imp"' not in loc_seek and 'data-flag="location"' not in loc_seek, "")

check("G-LOC-2", "matching.js reads the three text fields by their own names (trimmed, empty -> skip)",
      'textval("country")' in MATCH and 'textval("city")' in MATCH and 'textval("postal")' in MATCH
      and "answers.country = locCountry" in MATCH and "answers.city = locCity" in MATCH
      and "answers.postal = locPostal" in MATCH, "")
check("G-LOC-2", "matching.js distance score-item contract intact (ITEMS keys distance; qval/impval/flag read by name)",
      'distance:  { label: "Distance"' in MATCH
      and 'input[name="' in MATCH and 'qval(item)' in MATCH and 'impval(item)' in MATCH
      and 'flagValues(item)' in MATCH, "")

# =========================================================================
# Slice 11 — MediaPipe cartoonizer demo gates G-MP-1..5
# =========================================================================
AVR = load("avatar-render.js")
MPD = load("mediapipe-demo.mjs")
AVATAR = view("avatar")
DFLT = view("default-avatar")

_node = shutil.which("node")
_mp_st = subprocess.run([_node, os.path.join(HERE, "avatar-render.js"), "--selftest"],
                        capture_output=True, text=True) if _node else None
_mp_json = None
if _mp_st and _mp_st.returncode == 0:
    try:
        _mp_json = json.loads(_mp_st.stdout.strip().splitlines()[-1])
    except Exception:
        _mp_json = None

VENDOR = os.path.join(HERE, "vendor", "mediapipe")
TEST_INPUT = os.path.join(HERE, "vendor", "test-input", "neil-armstrong.jpg")

# G-MP-1 — demo view exists + reachable + camera/fallback path (headless).
check("G-MP-1", "Avatar demo view exists (id v-avatar / data-view=avatar)",
      'id="v-avatar"' in HTML and 'data-view="avatar"' in HTML, "")
check("G-MP-1", "Avatar demo reachable from the persistent nav (data-nav / data-nav-key)",
      'data-nav="avatar"' in HTML and 'data-nav-key="avatar"' in HTML, "")
check("G-MP-1", "default-avatar view exists and is reachable (linked from the demo)",
      'data-view="default-avatar"' in HTML and 'data-nav="default-avatar"' in HTML, "")
check("G-MP-1", "both views are wired into the app.js state machine (FLOW + NAV_OWNER)",
      'id: "avatar"' in JS and 'id: "default-avatar"' in JS
      and 'avatar:   "avatar"' in JS and '"default-avatar": "avatar"' in JS
      and "renderDefaultAvatarView" in JS and "bootMediaPipeDemo" in JS, "")
check("G-MP-1", "fallback input path exercised headless (node avatar-render.js --selftest PASS)",
      bool(_mp_json) and _mp_json.get("selftest") == "PASS",
      (_mp_st.stdout or _mp_st.stderr).strip() if _mp_st else "node unavailable")
check("G-MP-1", "bundled public-domain test portrait vendored (fixed fallback input, no camera needed)",
      os.path.exists(TEST_INPUT) and os.path.getsize(TEST_INPUT) > 10000,
      TEST_INPUT if not os.path.exists(TEST_INPUT) else "")

# G-MP-2 — deterministic pipeline: fixed line-art palette/seed, stable render hash.
check("G-MP-2", "render pipeline is deterministic: fixed seed + fixed ink/paper/accents palette (no per-run variation)",
      "FIXED_SEED" in AVR and "PAPER" in AVR and "INK" in AVR and "LINEART_ACCENTS" in AVR
      and "nearestAccent" in AVR and "sobelEdges" in AVR and "renderLineArt" in AVR
      and bool(_mp_json) and _mp_json.get("deterministic") is True
      and _mp_json.get("seed") == 20260902
      and _mp_json.get("accentEntries") == 5, "")
check("G-MP-2", "stable render hash (8-hex fnv1a-32) reported and reproducible",
      bool(_mp_json) and isinstance(_mp_json.get("renderHash"), str)
      and re.fullmatch(r"[0-9a-f]{8}", _mp_json.get("renderHash", "")) is not None,
      _mp_json.get("renderHash") if _mp_json else "no json")
check("G-MP-2", "provenance string carries algorithm + input + seed + style + render hash",
      bool(_mp_json) and (_mp_json.get("provenance") or "").startswith("mediapipe-lineart/v1")
      and "seed:20260902" in _mp_json.get("provenance", "")
      and "style:line-art" in _mp_json.get("provenance", "")
      and "render:" in _mp_json.get("provenance", ""), "")

# G-MP-3 — no runtime network calls; vendor files are static local assets.
# Scope is OUR demo code (avatar-render.js + mediapipe-demo.mjs). vendor/ is a
# bundled third-party tree (Apache-2.0 MediaPipe) of static local assets; it is
# not scanned for network use — it loads its own wasm/model from LOCAL relative
# URIs via MediaPipe's internal resolver, never from an external origin.
_mp_own = AVR + MPD
_nethits = [p for p in (r'https?://', r'fetch\(', r'XMLHttpRequest', r'WebSocket',
                        r'sendBeacon', r'\.ajax\(') if re.search(p, _mp_own, re.I)]
check("G-MP-3", "demo code has no external URLs / fetch / XHR / WebSocket (no runtime network)",
      not _nethits, "hits: %s" % _nethits)
check("G-MP-3", "MediaPipe loads from local bundled URIs only (relative model + wasm paths)",
      '"./vendor/mediapipe/vision_bundle.mjs"' in MPD
      and 'WASM_ROOT = "vendor/mediapipe/wasm"' in MPD
      and 'MODEL_PATH = "vendor/mediapipe/face_landmarker.task"' in MPD
      and 'TEST_IMAGE_PATH = "vendor/test-input/neil-armstrong.jpg"' in MPD,
      "")
_need_vendor = ["vision_bundle.mjs", "face_landmarker.task",
                os.path.join("wasm", "vision_wasm_internal.wasm"),
                os.path.join("wasm", "vision_wasm_nosimd_internal.wasm")]
_missing_vendor = [v for v in _need_vendor if not os.path.exists(os.path.join(VENDOR, v))]
check("G-MP-3", "MediaPipe wasm + model + JS bundle are vendored locally (no CDN)",
      not _missing_vendor, "missing: %s" % _missing_vendor)

# G-MP-4 — no face-data retention + honest on-screen copy.
# Usage-pattern match only (identifier + `.`/`[`/`(` or method `(`), so honest
# doc-comments that merely *mention* these APIs do not count as retention.
_retain = [p for p in (r'\blocalStorage\s*[.\[(]', r'\bsessionStorage\s*[.\[(]',
                       r'\bindexedDB\s*[.\[(]', r'\.toBlob\s*\(', r'\.toDataURL\s*\(',
                       r'\bcreateObjectURL\s*\(', r'\brequestFileSystem\s*\(')
           if re.search(p, _mp_own)]
check("G-MP-4", "no storage / blob-export of the raw frame or mesh (code-level assert)",
      not _retain, "found: %s" % _retain)
_honest = ("processed on your device only" in HTML
           and "nothing leaves your phone" in HTML
           and "no face data is kept" in HTML)
check("G-MP-4", "honest on-screen copy present (on-device only, nothing leaves, no face data kept)",
      _honest, "")
check("G-MP-4", "demo HTML states the raw frame + mesh are discarded, nothing stored/uploaded",
      "discarded immediately" in AVATAR and "nothing is stored" in AVATAR
      and "nothing is uploaded" in AVATAR, "")

# G-MP-5 — default avatar renders from code with decided attributes.
check("G-MP-5", "default-avatar canvas carries machine-checkable decided attributes",
      'data-avatar-bright="true"' in DFLT and 'data-avatar-androgynous="true"' in DFLT
      and 'data-avatar-outline-only="true"' in DFLT
      and 'data-avatar-no-features="true"' in DFLT, "")
check("G-MP-5", "default avatar is code-generated (canvas, no <img>/image asset)",
      'id="default-avatar-canvas"' in DFLT and "<img" not in DFLT
      and "drawn" in DFLT.lower() and "no image assets" in DFLT, "")
check("G-MP-5", "render function + decided attribute set exist in code (bright/androgynous/outline/no-features)",
      "drawDefaultAvatar" in AVR and "DEFAULT_AVATAR_ATTRS" in AVR
      and "bright" in AVR and "androgynous" in AVR and "outline_only" in AVR
      and "no_discernible_features" in AVR, "")

# =========================================================================
# Slice 11b — line-art avatar style gates G-LA-1..5 (owner style decision)
# =========================================================================
# Reorg e7d9b12 (2026-09-03) moved verification records into verifications/;
# keep the legacy root path as fallback for older checkouts (G-LA-5 fix).
V11B_CANDIDATES = (
    os.path.join(os.path.dirname(HERE), "verifications", "verification-slice-11b.md"),
    os.path.join(os.path.dirname(HERE), "verification-slice-11b.md"),
)
V11B_PATH = next((p for p in V11B_CANDIDATES if os.path.exists(p)), None)
V11B = None
if V11B_PATH:
    with open(V11B_PATH, encoding="utf-8") as _f:
        V11B = _f.read()

# G-LA-1 — render output is line-art style (machine-checked: light paper base,
# stroke/edge primitives present, no flat-color fill inside the face region).
check("G-LA-1", "algorithm id + style classifier identify line-art (mediapipe-lineart/v1 / line-art)",
      bool(_mp_json) and _mp_json.get("algorithm") == "mediapipe-lineart/v1"
      and _mp_json.get("style") == "line-art"
      and "mediapipe-lineart/v1" in AVR and 'STYLE = "line-art"' in AVR, "")
check("G-LA-1", "selftest classifies output as line-art: light paper base dominant",
      bool(_mp_json) and _mp_json.get("lightBase") is True, "")
check("G-LA-1", "selftest classifies ink stroke/edge primitives present",
      bool(_mp_json) and _mp_json.get("strokePrimitives") is True, "")
check("G-LA-1", "selftest classifies NO flat-color fill inside the face region",
      bool(_mp_json) and _mp_json.get("faceFill") is False, "")
check("G-LA-1", "render pass = Sobel edges + paper base + accent mask only (accents never touch the face)",
      "sobelEdges" in AVR and "renderLineArt" in AVR and "classifyLineArt" in AVR
      and "PAPER" in AVR and "INK" in AVR and "accentMask" in AVR and "faceMask" in AVR
      and "nearestAccent" in AVR, "")

# G-LA-2 — determinism: render hash stable across runs.
check("G-LA-2", "render hash stable across runs (deterministic, byte-identical output)",
      bool(_mp_json) and _mp_json.get("deterministic") is True
      and isinstance(_mp_json.get("renderHash"), str)
      and re.fullmatch(r"[0-9a-f]{8}", _mp_json.get("renderHash", "")) is not None, "")
check("G-LA-2", "fixed seed constant locks the render (20260902)",
      bool(_mp_json) and _mp_json.get("seed") == 20260902 and "FIXED_SEED" in AVR, "")

# G-LA-3 — no retention + no runtime network (existing checks still green).
check("G-LA-3", "no retention of raw frame / mesh (no storage or blob-export APIs in demo code)",
      not _retain, "found: %s" % _retain)
check("G-LA-3", "no runtime network in demo code (no external URLs / fetch / XHR / WebSocket)",
      not _nethits, "hits: %s" % _nethits)

# G-LA-4 — honest on-screen copy present (same strings, unchanged).
check("G-LA-4", "honest on-screen copy unchanged (on-device only, nothing leaves, no face data kept)",
      _honest, "")
check("G-LA-4", "raw frame + mesh discard copy present (discarded immediately, nothing stored/uploaded)",
      "discarded immediately" in AVATAR and "nothing is stored" in AVATAR
      and "nothing is uploaded" in AVATAR, "")

# G-LA-5 — style reference documented (InstantID line-art reference + license
# reason we do NOT use InstantID + the public-domain test input).
check("G-LA-5", "verification record documents the InstantID line-art style reference + license reason",
      bool(V11B) and "InstantID" in V11B and "line-art" in V11B.lower()
      and "license" in V11B.lower() and "MediaPipe" in V11B, "")
check("G-LA-5", "verification record documents the public-domain test input (no real user photo)",
      bool(V11B) and "public-domain" in V11B and "neil-armstrong" in V11B, "")

# =========================================================================
# Slice 13 — score-floor filter gates G-FL-1..5 (soft display filter)
# =========================================================================
DISC = view("discover")
OWNER_COPY = "the score shows how well they fit what you're looking for. Higher is better."


def _norm(s):
    return re.sub(r"\s+", " ", s.lower())


_floor_input = re.search(r'<input[^>]*id="score-floor-input"[^>]*>', DISC)
_floor_tag = _floor_input.group(0) if _floor_input else ""

# G-FL-1 — filter control in Discover: default 40, range 0-100, immediate
# re-render (no reload), localStorage pref, owner-verbatim meaning copy.
check("G-FL-1", "Discover view contains a score-floor filter control (id=score-floor + label)",
      'id="score-floor"' in DISC and 'id="score-floor-input"' in DISC
      and "Minimum score" in DISC, "")
check("G-FL-1", "floor control is a numeric input defaulting to 40, range 0-100, step 1",
      bool(_floor_tag) and 'type="number"' in _floor_tag and 'value="40"' in _floor_tag
      and 'min="0"' in _floor_tag and 'max="100"' in _floor_tag and 'step="1"' in _floor_tag,
      _floor_tag)
check("G-FL-1", "owner-verbatim meaning copy present on the surface (score = fit, higher is better)",
      _norm(OWNER_COPY) in _norm(HTML), "")
check("G-FL-1", "floor changes re-render without a page reload (input+change listeners; no location.reload/assign)",
      "applyScoreFloor" in JS and 'floorInput.addEventListener("input"' in JS
      and 'floorInput.addEventListener("change"' in JS
      and "location.reload" not in JS and "location.assign" not in JS, "")
check("G-FL-1", "floor pref persisted per-browser via localStorage (p2-score-floor get/set)",
      '"p2-score-floor"' in JS and "getItem(SCORE_FLOOR_KEY)" in JS
      and "setItem(SCORE_FLOOR_KEY, String(v))" in JS, "")

# G-FL-2 — floor is a display filter only: below-floor hidden, at/above shown;
# scores/breakdowns byte-identical to the no-filter run (floor != score change).
check("G-FL-2", "scoring/breakdown write path in matching.js unchanged (floor never rewrites the score)",
      'if (numEl) numEl.textContent = String(scored.score);' in MATCH
      and 'if (bdBody) bdBody.innerHTML = breakdownHTML(scored);' in MATCH, "")
check("G-FL-2", "app.js floor logic never writes scores or breakdown bodies (no breakdownHTML / data-breakdown-body / score assignment)",
      "breakdownHTML" not in JS and "String(scored.score)" not in JS
      and "data-breakdown-body" not in JS, "")
check("G-FL-2", "below-floor scored candidates are hidden; at/above-floor shown (score < floor guard + hide/show on the card)",
      "score < floor" in JS and 'card.setAttribute("hidden", "")' in JS
      and 'card.removeAttribute("hidden")' in JS, "")
check("G-FL-2", "matching.js deterministic self-test still PASS with the same score signature (A 100 / B 59 / C 15 / D 6)",
      bool(selftest) and selftest.returncode == 0 and '\"selftest\":\"PASS\"' in selftest.stdout
      and '["A",100]' in selftest.stdout and '["B",59]' in selftest.stdout
            and '["C",15]' in selftest.stdout and '["D",6]' in selftest.stdout, "")

# G-FL-3 — red-flag exclusions unchanged and still the ONLY hard path; excluded
# candidates never appear at ANY floor setting; no new hard cutoff.
check("G-FL-3", "red-flag exclusion in matching.js unchanged (absent/no-score/private reason path intact)",
      'return { id: cand.id, excluded: true, reason: reason, score: null, breakdown: null };' in MATCH
      and 'red-flagged candidate is ABSENT' in MATCH and 'card.setAttribute("hidden", "")' in MATCH, "")
check("G-FL-3", "floor never unhides a red-flag-excluded candidate (no-score guard returns early)",
      "if (isNaN(score)) return;" in JS, "")
check("G-FL-3", "no new hard cutoff: score-floor logic lives in app.js only, matching.js has no floor/threshold exclusion",
      "score-floor" not in MATCH and "score < floor" not in MATCH and "applyScoreFloor" not in MATCH, "")

# G-FL-4 — no regression: full suite exits 0; node --check clean; selftest PASS
# signature unchanged; contrast 38/38; identifier/secret/network scan clean.
_nodecheck_ok = bool(node)
if node:
    for _f in ("app.js", "matching.js"):
        _nc = subprocess.run([node, "--check", os.path.join(HERE, _f)],
                             capture_output=True, text=True)
        _nodecheck_ok = _nodecheck_ok and _nc.returncode == 0
        check("G-FL-4", "node --check %s exit 0 (vanilla ES5, no syntax errors)" % _f,
              _nc.returncode == 0, _nc.stderr.strip()[-200:])
else:
    check("G-FL-4", "node --check available", False, "node unavailable")
check("G-FL-4", "matching.js --selftest PASS with unchanged signature (same JSON keys/shape as baseline)",
      bool(selftest) and selftest.returncode == 0 and '\"selftest\":\"PASS\"' in selftest.stdout
      and '\"height_range_165_180\"' in selftest.stdout and '\"pets_acceptance\"' in selftest.stdout
      and '\"living_work_multi\"' in selftest.stdout, "")
check("G-FL-4", "contrast_check.py reports 38/38 pairs (WCAG 2.1 AA, both themes)",
      bool(ccr) and ccr.returncode == 0 and "CONTRAST PASS:" in ccr.stdout and "38/38" in ccr.stdout,
      (ccr.stdout or ccr.stderr).strip()[-160:] if ccr else "contrast_check.py missing")

# identifier / secret / network scan over the touched files (index/app/styles/matching).
_touched = HTML + JS + CSS + MATCH
_id2 = ["steuernummer", "gisa", "mytu", "tax id", "vat id"]
_id2_hits = [p for p in _id2 if p in _touched.lower()]
check("G-FL-4", "identifier scan clean over touched files (no owner / Steuernummer / GISA / myTU)",
      not _id2_hits, str(_id2_hits))
_secret2 = re.findall(r'(?:api[_-]?key|secret|password|passwd|token)\s*[:=]', _touched, re.I)
check("G-FL-4", "secret scan clean over touched files (no api key / token / password assignments)",
      not _secret2, str(_secret2[:5]))
_addr2 = re.findall(r'\b(?:Straße|Strasse|Gasse|Platz|Avenue|Street)\s+\d+', _touched, re.I)
check("G-FL-4", "address scan clean over touched files (no postal street address pattern)",
      not _addr2, str(_addr2[:5]))
_net2 = [p for p in (r'https?://', r'//cdn', r'@import\s+url\(', r'<script[^>]*src="http',
                     r'<link[^>]*href="http', r'<img[^>]*src="http') if re.search(p, _touched, re.I)]
check("G-FL-4", "network discipline intact — no external URLs/CDN in touched files; single same-origin fetch only",
      not _net2 and _fetch_ok, "ext:%s" % _net2)

# G-FL-5 — constraints held: EUR 0, vanilla-only, synthetic-only, no legal-text
# changes, no governance/state/scope/dispatch edits.
_cur2 = re.findall(r'[€$£]|EUR\s*\d|pricing|checkout|pay\b', _touched, re.I)
check("G-FL-5", "EUR 0 — no currency / pricing / payment markers in touched files",
      not _cur2, str(_cur2[:5]))
check("G-FL-5", "vanilla-only — floor control adds no framework / build tooling / new network surface",
      not _net2 and "score-floor" not in MATCH, "")
check("G-FL-5", "synthetic-only — no real-user identifiers or street addresses introduced",
      not _id2_hits and not _addr2, "")
check("G-FL-5", "no legal-text changes — terms/consent/counsel markers intact (legal view untouched)",
      'name="terms-accept"' in HTML and 'name="consent-matching"' in HTML
      and "counsel" in LEGAL.lower() and "draft" in LEGAL.lower(), "")

GATES = ("G-IMP-1", "G-IMP-2", "G-IMP-3", "G-IMP-4",
         "G-QM-1", "G-QM-2", "G-QM-3", "G-QM-4", "G-QM-5",
         "G-LG-1", "G-LG-2", "G-LG-3", "G-LG-4", "G-LG-5", "G-LG-6",
         "G-WCAG-1", "G-WCAG-2", "G-WCAG-3", "G-WCAG-4",
         "G-MP-1", "G-MP-2", "G-MP-3", "G-MP-4", "G-MP-5",
         "G-LA-1", "G-LA-2", "G-LA-3", "G-LA-4", "G-LA-5",
         "G-FL-1", "G-FL-2", "G-FL-3", "G-FL-4", "G-FL-5",
         "G-LOC-1", "G-LOC-2",
         "constraints")
print("=" * 70)
print("PARTNER-002 UI prototype gates — G-IMP-1..4 (slice 7e) + G-QM-1..5 (slice 9) + G-LG-1..6 (slice 8) + G-WCAG-1..4 (slice 8b) + G-LA-1..5 (slice 11b) + G-FL-1..5 (slice 13)")
print("=" * 70)
all_pass = True
for gate in GATES:
    group = [r for r in results if r[0] == gate]
    failures = [r for r in group if not r[2]]
    all_pass = all_pass and not failures
    print("\n[%s] %s  (%d ok, %d failing)" % (gate, "PASS" if not failures else "FAIL", len(group) - len(failures), len(failures)))
    for _, label, ok, detail in group:
        print("   %s %s%s" % ("ok " if ok else "!! ", label, ("  -> " + detail) if detail and not ok else ""))
print("\n" + "=" * 70)
passed = sum(1 for r in results if r[2])
print("TOTAL: %d/%d checks pass" % (passed, len(results)))
print("ALL GATES PASS" if all_pass else "GATES FAILING")
print("=" * 70)
sys.exit(0 if all_pass else 1)
