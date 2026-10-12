---
phase: 02-copilot-pmo
plan: 03
type: Summary
completed: 2026-07-17
description: "Session, slot-filler, question-policy"
---

# Phase 02 Plan 03 — Moteur dialogue

**Livrables :** `session.ts`, `slot-filler.ts`, `question-policy.ts`.

- Machine à états gathering → preview → executed/cancelled
- Extraction heuristique de slots (budget, dates, stages)
- `detectIntentFromMessage` pour fallback sans LLM
- Questions dynamiques selon slots manquants et choix portefeuille

Tests slot-filler dans `copilot.test.ts`. Typecheck OK.
