---
phase: 01-next-wave
plan: 01
subsystem: engine
tags: [typescript, evm, baseline, cpm, metrics]

requires: []
provides:
  - "Task.baseline optional snapshot field (start/finish/cost)"
  - "Task.actualCost optional field for timesheet data"
  - "ProjectMetrics extended with 8 EVM fields: bac, ac, spi, cpi, eac, etc, sv, cv"
  - "computeMetrics updated to compute full EVM"
  - "3 EVM tests verifying formula correctness"
affects: ["01-02", "01-03"]

tech-stack:
  added: []
  patterns:
    - "EVM with PV=BAC (no time-phasing); SPI=EV/BAC, CPI=EV/AC"
    - "actualCost absent → AC defaults to EV per task (no cost variance assumption)"

key-files:
  created: []
  modified:
    - packages/scheduling-engine/src/types.ts
    - packages/scheduling-engine/src/metrics.ts
    - packages/scheduling-engine/src/cpm.test.ts

key-decisions:
  - "PV = BAC (not time-phased): avoids needing a status date parameter in the engine"
  - "actualCost absent → AC = EV: conservative no-variance default until real timesheets wired in"

patterns-established:
  - "All new Task fields are optional to preserve backward compatibility with existing tasks"

duration: ~15min
started: 2026-07-03T15:45:00Z
completed: 2026-07-03T15:55:00Z
description: "Added Task.baseline + Task.actualCost types and full EVM metrics (BAC/SPI/CPI/EAC/ETC/SV/CV) to scheduling engine; 19 tests passing"
type: Summary
about: Atelier — Portefeuille PMO
---

# Phase 01 Plan 01: Engine — Baselines + EVM Summary

**Added `baseline?` + `actualCost?` to `Task` type and full EVM output (BAC/SPI/CPI/EAC/ETC/SV/CV) to `ProjectMetrics`; 19 tests passing, TypeScript clean.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~15 min |
| Tasks | 3/3 completed |
| Files modified | 3 |
| Tests | 19 passing (16 existing + 3 new EVM) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: Baseline fields on Task | Pass | `baseline?: { start, finish, cost }` — all optional |
| AC-2: Actual cost on Task | Pass | `actualCost?: number`; AC = EV when absent |
| AC-3: Full EVM in ProjectMetrics | Pass | bac, ac, spi, cpi, eac, etc, sv, cv all computed |
| AC-4: Tests pass | Pass | 19/19 green; 3 new EVM tests cover CPI=1, CPI<1, 100%-complete cases |

## Accomplishments

- `Task` interface extended with optional `baseline` (start/finish/cost) and `actualCost` — zero breaking changes
- `ProjectMetrics` now exposes 8 EVM fields: `bac`, `ac`, `spi`, `cpi`, `eac`, `etc`, `sv`, `cv`
- `computeMetrics` accumulates `totalAc` (uses `task.actualCost ?? earnedCost` per leaf)
- EVM formulas: SPI=EV/BAC, CPI=EV/AC, EAC=BAC/CPI, ETC=EAC−AC, SV=EV−BAC, CV=EV−AC
- PV fixed at BAC (no time-phased S-curve — documented decision)

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `packages/scheduling-engine/src/types.ts` | Modified | Added `baseline?` + `actualCost?` to `Task` |
| `packages/scheduling-engine/src/metrics.ts` | Modified | Extended `ProjectMetrics` + updated `computeMetrics` |
| `packages/scheduling-engine/src/cpm.test.ts` | Modified | Added 3 EVM tests under `describe("EVM metrics")` |

## Decisions Made

| Decision | Rationale | Impact on future work |
|----------|-----------|----------------------|
| PV = BAC (not time-phased) | Engine has no status-date parameter; adding one is roadmap v0.3 | SV = EV − BAC; negative for incomplete projects — UI in 01-02 should label SV accordingly |
| AC defaults to EV when `actualCost` absent | No cost variance assumption until timesheets wired; prevents misleading CPI<1 with no data | Plan 01-02 seed.ts adds realistic `actualCost` overrides for demo |

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

**Ready:**
- `@atelier/scheduling-engine` exports `ProjectMetrics` with full EVM — Plan 01-02 can call `metricsOf()` and read `.spi`, `.cpi`, `.eac`, `.bac`, `.ac`, `.etc`, `.sv`, `.cv`
- `Task.baseline` field available for `captureBaseline()` store action
- `Task.actualCost` field available for `updateActualCost()` store action

**Concerns:**
- SV formula (EV − BAC) is negative for all incomplete projects; Plan 01-02 UI should display as "Écart planning" with appropriate sign handling
- `taskPlannedCost` not exported as a named export for web app use — Plan 01-02 should import from `@atelier/scheduling-engine` or replicate inline (it is exported via `export * from "./metrics"`)

**Blockers:** None

---
*Phase: 01-next-wave, Plan: 01*
*Completed: 2026-07-03*
