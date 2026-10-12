# Roadmap — Atelier PMO

## Milestone v0.2 — Next Wave (In progress)

### Phase 01 — Next Wave features
Status: In progress

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

## Milestone v0.4 — Copilot PMO (Complete)

### Phase 02 — Copilot PMO
Status: Complete

Assistant conversationnel orienté objectif : registre d'actions, dialogue adaptatif (slots + questions), preview avant mutation, mémoire d'apprentissage synchronisée Neon.

| # | Plan | Features | Status |
|---|------|----------|--------|
| 02-01 | Registre d'actions | Types copilot + action registry miroir store + preview builder | ✅ Done |
| 02-02 | Mémoire copilot | CopilotMemory Prisma + API GET/PUT + sync Neon bidirectionnelle | ✅ Done |
| 02-03 | Moteur dialogue | Session state machine, slot-filler, question-policy | ✅ Done |
| 02-04 | API chat LLM | POST /api/copilot/chat + context builder portfolio compact | ✅ Done |
| 02-05 | UI CopilotPanel | Panneau chat latéral Shell + widgets questions + flux preview | ✅ Done |
| 02-06 | Intents lecture | Queries portefeuille (santé, RAID, pipeline, charge) | ✅ Done |
| 02-07 | Intents RAID/Projet/Pipeline | Mutations createProject, RAID, stage-gate, convertDemand | ✅ Done |
| 02-08 | Intents planning | Tâches, dépendances, baseline, shift | ✅ Done |
| 02-09 | Boucle apprentissage | Signals, few-shot, preferences, actor audit copilot | ✅ Done |
| 02-10 | Gouvernance + polish | Settings mémoire, tests Vitest, README | ✅ Done |

### Wave execution order
- Wave 1 (parallel): 02-01 (registry), 02-02 (memory)
- Wave 2: 02-03 (dialogue), 02-04 (API chat — after 02-01 + 02-02)
- Wave 3: 02-05 (UI — checkpoint human-verify)
- Wave 4 (parallel, after 02-05): 02-06 (queries), 02-07 (RAID/projet/pipeline)
- Wave 5: 02-08 (planning), 02-09 (learning — after 02-02 + 02-07)
- Wave 6: 02-10 (governance + UNIFY milestone)

### Décisions milestone v0.4
| Date | Decision | Reason |
|------|----------|--------|
| 2026-07-17 | Panneau chat latéral dans Shell (pas palette Ctrl+K seule) | Point d'entrée principal visible ; palette en backlog v0.5 |
| 2026-07-17 | Mémoire copilot synchronisée Neon (table dédiée) | Apprentissage partagé desktop ↔ cloud ; merge comme AuditEntry |
| 2026-07-17 | Write path via store Zustand (pas endpoints CRUD granulaires) | Réutilise validations existantes ; évite duplication métier |
| 2026-07-17 | Pas de fine-tuning LLM | Mémoire structurée + few-shot in-context ; contrôle et coût |

---

## Milestone v0.3 — Future
- Nivellement de ressources (UI)
- Import/export .mpp (MPXJ)
- Collaboration temps réel
- Copilot v0.5 : ressources, temps, KPI, Ctrl+K shortcut
