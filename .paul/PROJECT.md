---
name: Atelier — Portefeuille PMO
type: Project
---

## Value Proposition
MS Project replica for PMO portfolio management: Gantt, CPM engine, resource heatmap, dashboard RAG.

## Stack
- Monorepo: pnpm workspaces
- Web: React 19, Vite, Zustand, React Router DOM 7
- Engine: `packages/scheduling-engine` — pure TypeScript, zero runtime deps
- Styles: plain CSS in `apps/web/src/styles/`

## Constraints
- Engine (`packages/scheduling-engine`) must remain pure TS — no DOM, no React, no external runtime deps
- All engine changes must keep the 16 existing tests passing (`pnpm test`)
- No new npm packages without explicit decision
- French UI labels (project is French-speaking PMO audience)

## Key Files
| File | Role |
|------|------|
| `packages/scheduling-engine/src/types.ts` | All shared domain types |
| `packages/scheduling-engine/src/metrics.ts` | EVM/cost computations |
| `packages/scheduling-engine/src/cpm.ts` | CPM forward/backward pass |
| `packages/scheduling-engine/src/index.ts` | Public API barrel |
| `apps/web/src/domain.ts` | Web-layer types (Project, Portfolio, Risk) |
| `apps/web/src/store.ts` | Zustand store + WeakMap schedule/metrics caches |
| `apps/web/src/seed.ts` | Sample data — 4 projects, 8 resources |
| `apps/web/src/views/ProjectView.tsx` | Gantt + task grid split view |
| `apps/web/src/views/DashboardView.tsx` | Portfolio dashboard |
| `apps/web/src/components/TaskGrid.tsx` | Inline-editable task grid |
| `apps/web/src/components/Gantt.tsx` | SVG Gantt |
