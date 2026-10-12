---
phase: 02-copilot-pmo
plan: 09
type: Summary
completed: 2026-07-17
description: "Boucle apprentissage signals/few-shot/preferences"
---

# Phase 02 Plan 09 — Boucle apprentissage

**Livrables :** `signals.ts`, `few-shot.ts`, `preferences.ts`, intégration CopilotPanel + debounced PUT mémoire.

- Épisodes few-shot pour enrichir le prompt LLM
- Désambiguïsations et stats questions
- Préférences (manager par défaut, approbateurs gates)
- `recordSuccessfulExecution` après confirm

Tests signals + few-shot dans `copilot.test.ts`. Typecheck OK.
