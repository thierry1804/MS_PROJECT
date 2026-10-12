---
phase: 02-copilot-pmo
plan: 05
type: Summary
completed: 2026-07-17
description: "CopilotPanel UI + intégration Shell"
---

# Phase 02 Plan 05 — UI CopilotPanel

**Livrables :** `CopilotPanel.tsx`, `CopilotMessage.tsx`, `CopilotQuestionField.tsx`, `copilot.css`, toggle dans `Shell.tsx`.

- Panneau 320 px à droite, persistance open/closed localStorage
- Flux message → questions → preview → confirm/cancel
- Layout `shell-body` sans casser les vues existantes

**Checkpoint human-verify :** lancer `pnpm dev:stack` et tester un intent mutation + query.
