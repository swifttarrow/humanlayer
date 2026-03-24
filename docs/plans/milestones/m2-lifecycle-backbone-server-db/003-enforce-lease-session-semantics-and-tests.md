# Task 003: Enforce Lease and Session Semantics with Tests

## Goal
Implement lease/session services that guarantee atomic claim/renew, stale-write protection, and correct stop/retry transitions.

## Deliverables
- [x] `apps/server/src/services/leaseService.ts` provides atomic lease claim and renewal logic
- [x] `apps/server/src/services/sessionService.ts` enforces lifecycle transitions and idempotent stop/retry behavior
- [x] Server tests cover restart durability, single active claim behavior, and repeated stop idempotency

## Notes
Use transactional writes for multi-step state transitions to avoid race-condition regressions.

## Verification
Run `npm run test --workspace=apps/server` and `npm run typecheck --workspace=apps/server`.
