---
phase: 02-copilot-pmo
plan: 01
type: Summary
completed: 2026-07-17
description: "Registre d'actions copilot, types, preview builder, tests registry"
---

# Phase 02 Plan 01 — Registre d'actions

**Livrables :** `apps/web/src/copilot/types.ts`, `intents.ts`, `registry.ts`, `preview.ts`, `store-bridge.ts`, `uid.ts`, `registry.test.ts`.

- ~25 intents typés avec slots requis/recommandés
- `executeAction` route queries vs mutations via store Zustand
- `buildPreview` avec confirmation destructive
- Audit `actor: "copilot"` sur mutations

Tests : 4/4 registry. Typecheck OK.
