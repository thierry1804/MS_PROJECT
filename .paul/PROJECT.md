---
name: Atelier — Portefeuille PMO
type: Project
---

## Value Proposition
MS Project replica for PMO portfolio management: Gantt, CPM engine, resource heatmap, dashboard RAG. Milestone v0.4 adds a conversational Copilot that executes PMO actions via natural language with adaptive questioning and learning memory.

## Stack
- Monorepo: pnpm workspaces
- Web: React 19, Vite, Zustand, React Router DOM 7
- API: Fastify 5, Prisma 6, OpenRouter/OpenAI-compatible LLM (runtime config)
- Engine: `packages/scheduling-engine` — pure TypeScript, zero runtime deps
- Styles: plain CSS in `apps/web/src/styles/`

## Constraints
- Engine (`packages/scheduling-engine`) must remain pure TS — no DOM, no React, no external runtime deps
- All engine changes must keep existing tests passing (`pnpm test`)
- No new npm packages without explicit decision
- French UI labels (project is French-speaking PMO audience)
- Copilot mutations MUST go through `apps/web/src/copilot/registry.ts` → Zustand store — never bypass store validations
- Do NOT fine-tune LLM models — learning via structured memory (preferences, episodes, questionStats) + few-shot injection
- Copilot audit entries use `actor: "copilot"` (distinct from human `"—"`)
- Do NOT modify `apps/api/src/risk-assist.ts` behavior — copilot may call it optionally for risk enrichment
- Copilot memory stored in dedicated `CopilotMemory` table — NOT embedded in Portfolio PUT payload

## Key Files
| File | Role |
|------|------|
| `packages/scheduling-engine/src/types.ts` | All shared domain types |
| `packages/scheduling-engine/src/metrics.ts` | EVM/cost computations |
| `packages/scheduling-engine/src/cpm.ts` | CPM forward/backward pass |
| `packages/scheduling-engine/src/index.ts` | Public API barrel |
| `apps/web/src/domain.ts` | Web-layer types (Project, Portfolio, Risk) |
| `apps/web/src/store.ts` | Zustand store + WeakMap schedule/metrics caches |
| `apps/web/src/copilot/` | Copilot: registry, session, slot-filler, question-policy, signals |
| `apps/web/src/components/CopilotPanel.tsx` | Chat UI panneau latéral |
| `apps/web/src/components/RiskAssistWizard.tsx` | Reference pattern: wizard 4 étapes + questions adaptatives |
| `apps/web/src/risk-assist/questions.ts` | Reference pattern: question-policy heuristique |
| `apps/api/src/copilot.ts` | POST /api/copilot/chat — LLM orchestration |
| `apps/api/src/copilot-memory.ts` | GET/PUT /api/copilot/memory |
| `apps/api/src/risk-assist.ts` | Existing risk LLM assist (do not break) |
| `apps/api/src/sync-engine.ts` | Cloud sync — extend with mergeCopilotMemory |
| `apps/web/src/Shell.tsx` | Shell + toggle CopilotPanel |
