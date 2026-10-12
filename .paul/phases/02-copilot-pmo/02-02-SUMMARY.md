---
phase: 02-copilot-pmo
plan: 02
type: Summary
completed: 2026-07-17
description: "CopilotMemory Prisma + API + sync Neon"
---

# Phase 02 Plan 02 — Mémoire copilot

**Livrables :** modèle `CopilotMemory` (PG + SQLite), `copilot-memory.ts`, routes GET/PUT/DELETE, `mergeCopilotMemory` dans sync-engine, client `memory-client.ts` + sync web.

- Révision optimiste (409 sur conflit)
- Fusion bidirectionnelle desktop ↔ Neon comme AuditEntry
- Types wire unifiés via `copilot/types.ts`

Prisma generate OK. Typecheck OK.
