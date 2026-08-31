# PARTNER-002 — UI prototype (slice 7d)

A **clickable, static** prototype of the full user flow + post-match reveal ladder,
reworked per the CEO dispatch `dispatch-20260830-questionnaire-revision.md` (commit 1c04247):
the **questionnaire is/seeks split**, gender + sought-gender, height (Core) / no weight /
body-type (Extended), Extended/Deep dual-use (creation opt-in + ladder rung 2), and the
**onboarding reorder** (questionnaire → import). Vanilla HTML/CSS/JS only — no frameworks,
no CDN, no external assets, no backend. All data is **synthetic**; nothing identifies a real
person.

## What changed vs. slice 7c

1. **Is/seeks split on every item.** Each questionnaire item is explicitly tagged
   **🔍 About you** (an attribute of yours) and/or **🎯 Looking for** (what you seek in a
   partner). Symmetric items (relationship goal, monogamy, smoking, religion, kids, pets,
   politics) show **both sides**: your value *and* the value(s) you seek. **Red flags live
   only on the Looking-for side** (still private hard exclusions — a flagged value never
   matches).
2. **Gender + sought-gender (Core).** "Your gender" (enum + *Prefer not to say*) and
   "Gender(s) you're looking for" (multi-select + *Prefer not to say* + *Any*).
3. **Height in Core (enum ranges); weight absent everywhere; body-type in Extended only.**
   Height is a set of range choices; there is no weight item in any tier; Extended gains an
   optional body-type enum (slim / average / athletic / fuller / prefer-not-to-say) as the
   less-loaded proxy.
4. **Extended / Deep are opt-in at creation AND the reveal ladder's rung 2 material.**
   Offered as toggles in the questionnaire, addable anytime from "Your profile"; the same
   answers become shareable after a mutual match (ladder rung 2 explicitly links them).
5. **Onboarding reorder.** New order: **welcome → questionnaire (Core; Extended/Deep
   offered) → optional Takeout import (context-only, on-device) → profile review → pool.**
   The questionnaire is the dating signal; the import is just context.
6. **Prominent 0–100 "preference match" score + expandable breakdown** (kept from 7c),
   red-flag hard exclusions (kept), importance ratings on all Core items (kept).

## How to open / walk it

Open `index.html` directly (no server), or `python3 -m http.server` in this directory:

```sh
xdg-open index.html    # Linux
open index.html        # macOS
```

Dark theme is default; `☾ theme` toggles light/dark.

### The full flow (walk it top-to-bottom)

| # | Screen | What you do |
|---|--------|-------------|
| 1 | **Welcome** | tap `Start` |
| 2 | **Questionnaire** | Core 15 q — each labeled **About you** / **Looking for** (symmetric ones show both). Set importance (1–5); tap the ⚑ on any *Looking-for* value to red-flag it. Kids shows only when the *Looking-for* goal isn't casual/undecided. Optionally toggle **Extended** / **Deep**. |
| 3 | **Your data (import)** | optional — drop the mock Takeout file → context chips appear (on-device, context only) |
| 4 | **Your profile (review)** | summary of answers; tiers addable anytime; derived chips; `Enter the pool` |
| 5 | **Discover** | cards show a **0–100 preference match** + "How is this calculated?"; interested/decline/skip/report |
| 6 | *(Interested on card A)* | A is mutual → auto-advance to **Match** |
| 7 | **Reveal ladder** | rung 2 = your Extended/Deep answers + conversation starters (same answers, two uses) |
| 8 | **Safety** | your data, activity log, report to a human |

Persistent nav (Discover / Your profile / Matches / Safety) is on every screen; the brand
mark is "home".

## Honesty copy (binding)

In the collapsible **"About privacy"** footer (every screen) and in every score breakdown:

- the score is a **preference match — not a chemistry or compatibility prediction**;
- **red flags are private dealbreakers** — someone you flag simply never shows up, and
  they're never told;
- answers and imports stay on-device; only context chips and counts move around;
- the overseer filter is **best-effort, not a promise** nothing can leak;
- **made-up data only** — no real people.

## Files

- `index.html` — all 9 views (single SPA shell) + is/seeks questionnaire + tiers + review
- `styles.css` — design system (+ slice 7d `.axis__tag`, `.axis-side`, `.opt-in`, `.axis-legend`)
- `matching.js` — deterministic matching module (unchanged from 7c): red-flag hard
  exclusions + weighted score + breakdown render + `--selftest`
- `app.js` — state machine (reordered FLOW: questionnaire → import → review) + red-flag
  validation + conditional children (keyed to the *Looking-for* goal)
- `gate_tests_ui.py` — machine checks for gate **G-QR-1..6** (27 checks)
- `../verification-slice-7d.md` — gate evidence + honest notes
