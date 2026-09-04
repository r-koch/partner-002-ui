# partner-002-ui — a clickable dating-app UI prototype (synthetic demo)

A **static, clickable prototype** of a preference-based matching flow. It demonstrates the
full user journey — an is/seeks *questionnaire*, an optional *context import*, a *profile
review*, a *candidate pool* with a 0–100 **preference-match score**, a *post-match reveal
ladder*, and a *safety* screen — plus a draft legal/consent flow ("Before you join").

Vanilla **HTML / CSS / JavaScript only** — no frameworks, no CDN, no external assets, no
backend, no network calls. Every person, score and answer shown is **synthetic**; nothing
identifies a real person. This is a design prototype, not a product build.

## Open it

No server needed — open `index.html` directly in a browser:

```sh
xdg-open index.html    # Linux
open index.html        # macOS
```

Dark theme is the default; the moon toggle flips to light (WCAG-2.1-AA contrast-verified in both).

## What it demonstrates

- **Is / seeks split.** Each questionnaire item is tagged **About you** (an attribute of
  yours) and/or **Looking for** (what you seek in a partner). Symmetric items ask both.
- **Importance + red flags (Looking-for only).** Every *Looking-for* answer carries a 1–5
  importance rating (the matching weight) and an optional **red flag** — a private
  dealbreaker: someone you flag simply never appears, and they're never told.
- **Preference-match score.** A 0–100 overlap score with an expandable, honest breakdown;
  labelled clearly as a **preference match, not a chemistry/compatibility prediction**.
- **Context import (optional).** Drop a mock export to see context *chips* — small labels,
  never raw data. The import runs *after* the questionnaire and never prefills it.
- **Reveal ladder.** After a mutual match, deeper (opt-in) answers unlock in stages.
- **Honesty copy.** Red flags are private; answers stay on-device; only chips/counts move
  around; made-up data only.

## Accessibility

Built to **WCAG 2.1 AA**: no text below 12px (body 16px / secondary 14px), all text and
component colour pairs ≥ 4.5:1 (large/UI ≥ 3:1) in both themes, visible `:focus-visible`
rings, and target sizes ≥ 24px (buttons 40px).

## Files

| File | Purpose |
|---|---|
| `index.html` | Single-page app shell — all views + the questionnaire |
| `styles.css` | Design system (dark + light themes) |
| `app.js` | State machine, theme toggle, red-flag + interest + withdrawal demo logic |
| `matching.js` | Deterministic preference-match module (runs under Node with `--selftest`) |

## Disclaimer

Synthetic demo data only. Nothing here is production matching logic, legal advice, or a claim
of legal compliance.
