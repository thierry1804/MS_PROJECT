---
phase: 02-copilot-pmo
plan: 04
type: Summary
completed: 2026-07-17
description: "POST /api/copilot/chat + llm-bridge client"
---

# Phase 02 Plan 04 — API chat LLM

**Livrables :** `apps/api/src/copilot.ts`, route POST `/api/copilot/chat`, `llm-bridge.ts`, `fetchCopilotChat` dans sync.

- Contexte portefeuille compact (projets, risques top, demandes)
- OpenRouter via config IA existante ; fallback heuristique si non configuré
- Fusion réponse LLM + préférences mémoire côté client

Typecheck OK.
