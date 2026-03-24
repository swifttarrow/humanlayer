# Task 002: Map Blocked and Phase Events Into Derived State

## Goal
Update server-side projection logic so new phase and blocked terminal events produce accurate `session` and `session_state` records.

## Deliverables
- [x] `apps/server/src/services/eventIngestService.ts` handles blocked terminal mapping
- [x] `apps/server/src/services/sessionService.ts` allows retry semantics from blocked sessions
- [x] Tests cover blocked terminal transitions and phase updates in derived state

## Notes
Keep terminal mapping idempotent and consistent with existing append-only event ingest guarantees.

## Verification
Run `npm run test --workspace=apps/server` and verify blocked sessions are queryable and retryable.
