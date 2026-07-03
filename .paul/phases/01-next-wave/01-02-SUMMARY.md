---
phase: 01-next-wave
plan: 02
subsystem: ui
tags: [react, evm, baseline, variance, zustand, css]

requires:
  - phase: 01-next-wave plan 01
    provides: "Task.baseline, Task.actualCost types, ProjectMetrics EVM fields"
provides:
  - "captureBaseline + updateActualCost store actions"
  - "EVM strip (BAC/VG/CR/IDP/ICP/EAC/ETC) in ProjectView"
  - "Baseline capture button + Écarts variance toggle in ProjectView toolbar"
  - "TaskGrid variance columns (Δdébut / Δfin / CV%) with color coding"
  - "IDP + ICP columns in Dashboard portfolio table"
  - "4 seed tasks with realistic actualCost for EVM demo"
affects: ["01-03"]

tech-stack:
  added: []
  patterns:
    - "evmClass(val) helper inline per view — not shared util (avoid premature abstraction)"
    - "TaskGrid variance cols opt-in via showVariance + resources props (additive, no breaking change)"
    - ".evm-good/.evm-warn/.evm-bad in base.css (shared across views)"
    - "captureBaseline uses scheduleOf inside set() — safe because WeakMap auto-evicts on project replacement"

key-files:
  created: []
  modified:
    - apps/web/src/domain.ts
    - apps/web/src/store.ts
    - apps/web/src/seed.ts
    - apps/web/src/components/TaskGrid.tsx
    - apps/web/src/views/ProjectView.tsx
    - apps/web/src/views/DashboardView.tsx
    - apps/web/src/styles/project.css
    - apps/web/src/styles/base.css

key-decisions:
  - "evmCls helper duplicated in ProjectView + DashboardView (not extracted) — no premature abstraction for 2 files"
  - "CV% per-task = (EV−AC)/plannedCost×100 — not project-level CV on every row"
  - "Δdébut/Δfin in calendar days (not working days) — avoids passing calendar to TaskGrid"
  - "actualCost seed values: crm-cad-1=6800 (favorable), crm-cad-2=4100 (favorable), crm-dev-2=7500 (unfavorable), crm-dev-3=6200 (unfavorable)"

patterns-established:
  - "Toolbar buttons use .toolbar-btn class (border, hover, .active state)"
  - "EVM chip layout: .evm-strip > .evm-chip { label + value stacked, right-aligned }"

duration: ~25min
started: 2026-07-03T16:00:00Z
completed: 2026-07-03T16:30:00Z
description: "Wired EVM engine into UI: baseline capture, EVM strip (7 metrics), variance columns in TaskGrid, IDP/ICP in Dashboard — human-verify approved"
type: Summary
about: Atelier — Portefeuille PMO
---

# Phase 01 Plan 02: Baseline UI + EVM Summary

**EVM fully visible in UI: 7-chip strip in ProjectView, baseline capture, Δdébut/Δfin/CV% toggle columns, IDP+ICP in Dashboard — all human-verified.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~25 min |
| Tasks | 3/3 completed + checkpoint approved |
| Files modified | 8 |
| Tests | 19/19 (no regression) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Baseline capture | Pass | Button captures dates+costs into task.baseline; label shows date after capture |
| AC-2: Variance columns in TaskGrid | Pass | Δdébut/Δfin (calendar days), CV% with evm-good/evm-bad coloring; summaries show "—" |
| AC-3: EVM KPI strip in ProjectView | Pass | 7 chips: BAC/VG/CR + separator + IDP/ICP + separator + EAC/ETC; SPI/CPI color-coded |
| AC-4: SPI/CPI in Dashboard table | Pass | IDP + ICP columns with evm-good/warn/bad coloring for all 4 projects |

## Accomplishments

- `captureBaseline(projectId)` snapshots schedule dates + computed cost into `task.baseline` for all leaf tasks
- `updateActualCost(projectId, taskId, cost)` patches `task.actualCost`, auto-invalidates metrics cache via Zustand object replacement
- EVM strip renders 7 metrics with color-coded SPI/CPI (green ≥1.0, amber 0.8–1.0, red <0.8)
- Variance toggle adds 3 columns: Δdébut, Δfin (calendar day diff vs baseline), CV% (per-task cost efficiency)
- Dashboard table extended with IDP (SPI) and ICP (CPI) columns, same color thresholds
- Seed demo data: 2 favorable (cad-1, cad-2) and 2 unfavorable (dev-2, dev-3) actualCost entries

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `apps/web/src/domain.ts` | Modified | `baselineCapturedAt?` on Project |
| `apps/web/src/store.ts` | Modified | `captureBaseline` + `updateActualCost` actions; imports `taskPlannedCost` |
| `apps/web/src/seed.ts` | Modified | 4 tasks with `actualCost` for realistic EVM demo |
| `apps/web/src/components/TaskGrid.tsx` | Modified | `showVariance` + `resources` props; Δdébut/Δfin/CV% columns |
| `apps/web/src/views/ProjectView.tsx` | Modified | EVM strip, toolbar buttons, passes showVariance+resources to TaskGrid |
| `apps/web/src/views/DashboardView.tsx` | Modified | IDP + ICP columns with `evmCls()` color helper |
| `apps/web/src/styles/project.css` | Modified | `.evm-strip`, `.evm-chip`, `.toolbar-btn`, `.var-cell` |
| `apps/web/src/styles/base.css` | Modified | `.evm-good`, `.evm-warn`, `.evm-bad` shared utilities |

## Decisions Made

| Decision | Rationale | Impact on future work |
|----------|-----------|----------------------|
| Δ in calendar days, not working days | Avoids adding `calendar` prop to TaskGrid | Inspector (01-03) can show working-day diff if needed |
| `evmCls` duplicated in each view | Only 2 uses; extracting to shared util is premature | If 01-03 or 01-04 needs it, extract then |
| CV% per-task not project-level | Per-row project CV% would be meaningless noise | Shows cost efficiency per task against its own BAC |

## Deviations from Plan

None — plan executed exactly as written. Checkpoint approved on first attempt.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- `captureBaseline` + `updateActualCost` store actions available for inspector panel (01-03)
- `showVariance` / `resources` props on TaskGrid are additive — 01-03 can extend props further
- EVM color classes in base.css available for inspector use

**Concerns:**
- `updateActualCost` not yet surfaced in any editable UI — inspector (01-03) should expose it
- No validation on `actualCost` input (negative values possible) — inspector should clamp to ≥0

**Blockers:** None

---
*Phase: 01-next-wave, Plan: 02*
*Completed: 2026-07-03*
