---
target: apps/web/src/Shell.tsx (sidebar/nav UX pass)
total_score: 27
p0_count: 1
p1_count: 2
timestamp: 2026-07-04T06-52-20Z
slug: apps-web-src-shell-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Sync status can scroll out of view once the project list is long enough |
| 2 | Match System / Real World | 4 | French copy, RAG semantics, terminology all correct |
| 3 | User Control and Freedom | 3 | Palette Esc works; no focus trap, no Tab-out handling |
| 4 | Consistency and Standards | 3 | `.hint-close` uses a raw "✕" glyph instead of the app's stroke-SVG icon family |
| 5 | Error Prevention | 3 | Unrelated to this diff (native `confirm()` for delete, pre-existing) |
| 6 | Recognition Rather Than Recall | 1 | Cmd/Ctrl+K has zero on-screen affordance anywhere |
| 7 | Flexibility and Efficiency | 3 | Palette + filter genuinely serve power users |
| 8 | Aesthetic and Minimalist Design | 4 | Restrained palette respected, no decorative color added |
| 9 | Error Recovery | 2 | Retry button exists but sits in a scrollable region that can hide it |
| 10 | Help and Documentation | 2 | Dismiss-once hint bar is the only "help," no way to bring it back |
| **Total** | | **27/40** | Solid, on-brief execution with real but fixable gaps |

## Anti-Patterns Verdict

**LLM assessment**: Mostly clean. The palette reuses the existing `modal-fade`/`modal-pop` keyframes and shadow value instead of inventing new visual language; no new colors introduced; no side-stripes, gradients, glassmorphism, or hero-metric template. One generic tell: the dismissible `.project-hint` bar (localStorage-flagged, close button) is a stock "onboarding tip" pattern that sits in the app's own stated anti-reference territory (generic SaaS onboarding), even though it's visually restrained enough not to clash with the paper/ink system.

**Deterministic scan**: Unavailable. `detect.mjs` reports "bundled detector not found" (`detector/detect-antipatterns.mjs` missing from this skill install) — a real, confirmed-missing entrypoint, not a crash mid-scan. No CLI findings to report.

**Visual overlays**: Unavailable. Browser automation could not connect this session (extension account mismatch, unrelated to this change) — no live-page injection or `[Human]` overlay was possible. This critique is code-review only; no automated or visual evidence layer.

## Overall Impression

The nav/UX pass does what it set out to do — filterable, health-sorted project list, a jump-anywhere command palette, a retry path for failed autosaves, a hint that stops nagging once seen — without breaking the "Restrained" color discipline or introducing decorative noise. The biggest gap is that two of the four additions (the palette shortcut, the retry button) are invisible exactly when the user needs them: the palette has no on-screen hint it exists, and the retry button can scroll out of view in the one scenario it exists for (an autosave failure on a long project list).

## What's Working

- Health-severity sort (`Shell.tsx`) surfaces red/amber projects first in the filtered list — directly serves the PMO "cherche les dérives" need from PRODUCT.md, a genuinely on-brief default rather than an arbitrary alphabetical list.
- Health dots reuse the existing semantic tokens (`--critical`/`--warn`/`--ok`) at 6px, no new color introduced, consistent with "couleur sémantique réservée aux états."
- The command palette flattens nav + projects into one filterable list rather than duplicating the sidebar's tree structure — correct IA call for a "jump to" tool.

## Priority Issues

**[P0] Sync status (and its retry button) can scroll out of view.**
Why it matters: `.sync-status` relies on `margin-top: auto` inside the scrolling `.sidebar` to sit at the bottom; once the project list is long enough to scroll — the exact condition the new sticky header was built for — that margin has no spare space and the status/retry row falls into normal flow at the end of the list. The one system-status indicator and the only error-recovery affordance in the shell can disappear off-screen at the moment of an actual autosave failure.
Fix: make `.sync-status` sticky to the bottom of `.sidebar` (mirror the sticky-top pattern just built for `.sidebar-section-head`), or move it outside the scrolling region.
Suggested command: `$impeccable polish apps/web/src/Shell.tsx`

**[P1] Cmd/Ctrl+K has no discoverability path.**
Why it matters: nothing on screen hints the palette exists — no icon, no label, no empty-state teach. A first-time user will never find it; Nielsen #6 scores 1/4 for exactly this.
Fix: add a small "⌘K" chip inside `.sidebar-search` (there's already room next to `SearchIcon`), which also clarifies the filter-vs-palette split.
Suggested command: `$impeccable clarify apps/web/src/Shell.tsx`

**[P1] Command palette has no focus trap.**
Why it matters: `role="dialog" aria-modal="true"` is set but `Tab` isn't intercepted — background sidebar controls remain reachable behind the backdrop, breaking the modal contract for keyboard/screen-reader users.
Fix: trap focus within `.palette` while open, or swap to a native `<dialog>` element.
Suggested command: `$impeccable harden apps/web/src/components/CommandPalette.tsx`

**[P2] Palette list lacks listbox semantics.**
Why it matters: `.palette-item` rows are plain `div`s with `onClick`/`onMouseEnter` — keyboard-navigable visually, but invisible to assistive tech as a selectable list (no `role="option"`, no `aria-selected`, no `aria-activedescendant`).
Fix: add `role="listbox"` on the list, `role="option"`/`aria-selected` per item, `aria-activedescendant` on the input.
Suggested command: `$impeccable audit apps/web/src/components/CommandPalette.tsx`

**[P3] Sidebar filter and command palette overlap without any cue distinguishing them.**
Why it matters: both do "find a project" with the same substring match; nothing teaches "filter = browse in place" vs. "palette = jump anywhere."
Fix: tighten placeholder copy so each surface's job is obvious at a glance (e.g. palette placeholder drops "ou un projet" if the ⌘K chip already implies scope).
Suggested command: `$impeccable clarify apps/web/src/Shell.tsx`

## Persona Red Flags

**PMO découvrant l'outil pour la première fois**: n'utilisera jamais Cmd/Ctrl+K (aucune affordance visible), et une fois le bandeau d'astuce fermé, aucun moyen de le rouvrir depuis Paramètres — l'app "apprend" une fois puis se tait.

**Chef de projet, session de plusieurs heures**: exactement la persona qui accumule assez de projets pour déclencher le P0 — son bouton "Réessayer" disparaît sous le pli au pire moment possible, une sauvegarde qui échoue activement.

## Minor Observations

- `.hint-close` uses a raw "✕" glyph while the rest of the toolbar goes through `icons.tsx`'s stroke-SVG family (minor inconsistency, matches the pre-existing `NewProjectModal` "✕" pattern though, so not a new break).
- `retrySync` in `store.ts` has no in-flight guard; a rapid double-click could double-fire `persistNow`. Low risk (`syncStatus` flips to "saving" and the button disappears) but a `syncStatus !== "saving"` guard would be cheap insurance.

## Questions to Consider

- If the sidebar filter and the command palette both exist, should the sidebar search box literally be the trigger surface for the palette (type-ahead promotes to overlay on Cmd+K) instead of two separate inputs?
- Given "modale pour tout" is an explicit anti-reference for MS Project, is a centered/top-aligned overlay the right form for the palette, or should it dock inline near the sidebar?
- Does a permanently-dismissed hint bar serve "l'outil disparaît derrière la tâche," or would a quieter, persistent affordance (e.g. a column-header micro-label) solve the same discoverability problem without the onboarding-toast pattern at all?
