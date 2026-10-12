## Current Position

Milestone: v0.4 Copilot PMO
Phase: 1 of 1 (02-copilot-pmo) — Complete
Plan: 02-01 through 02-10 implemented
Status: UNIFY complete
Last activity: 2026-07-17 — Copilot PMO milestone delivered

Progress:
- Milestone v0.4: [██████████] 100%
- Phase 02: [██████████] 100%

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ✓     [10/10 plans done — typecheck + 65 tests green]
```

## Session Continuity

Last session: 2026-07-17
Stopped at: Milestone v0.4 Copilot PMO complete
Next action: Human-verify CopilotPanel in dev:stack ; optional v0.5 backlog (Ctrl+K shortcut)
Resume file: .paul/ROADMAP.md

## Decisions
| Date | Decision | Reason |
|------|----------|--------|
| 2026-07-03 | Split next wave into 4 plans (01-01 to 01-04) | Engine changes isolated from UI; inspector depends on store actions |
| 2026-07-03 | baseline stored as fields on Task (not separate snapshot object) | Avoids breaking WeakMap cache and keeps engine types self-contained |
| 2026-07-17 | Copilot UI = panneau latéral Shell | Visibilité permanente ; cohérent avec RiskAssistWizard existant |
| 2026-07-17 | CopilotMemory table + sync Neon | Mémoire d'apprentissage partagée entre postes desktop |
| 2026-07-17 | Mutations copilot via action registry → store | Une seule source de vérité métier ; pas de PATCH API granulaire |
| 2026-07-17 | actor audit "copilot" pour mutations assistant | Traçabilité PMO humain vs IA |
| 2026-07-17 | Pas de fine-tuning LLM | Few-shot + preferences JSON suffisent pour v0.4 |
