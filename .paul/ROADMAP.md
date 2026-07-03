# Roadmap — Atelier PMO

## Milestone v0.2 — Next Wave (In progress)

### Phase 01 — Next Wave features
Status: Planning

| # | Plan | Features | Status |
|---|------|----------|--------|
| 01-01 | Engine: baselines + EVM | Add `baseline`/`actualCost` to Task type, extend ProjectMetrics with full EVM (BAC/SPI/CPI/EAC/ETC/SV/CV) | ✅ Done |
| 01-02 | Baseline UI + EVM cards | Baseline capture action in store, variance columns in TaskGrid, EVM KPI cards in ProjectView + DashboardView | ✅ Done |
| 01-03 | Inspecteur de tâche | Side-panel inspector: edit deps, assignments, constraint, notes for selected task | Not started |
| 01-04 | Export CSV / JSON | Export project tasks as CSV and full project as JSON; button in ProjectView toolbar | Not started |

### Wave execution order
- Wave 1 (parallel): 01-01 (engine), 01-04 (export — standalone)
- Wave 2 (after 01-01): 01-02 (baseline UI + EVM)
- Wave 3 (after 01-02): 01-03 (inspector — needs store actions from 01-02)

---

## Milestone v0.3 — Future
- Nivellement de ressources
- Import/export .mpp (MPXJ)
- API + persistance
- Collaboration temps réel
- Workflow de gouvernance (stage-gate)
