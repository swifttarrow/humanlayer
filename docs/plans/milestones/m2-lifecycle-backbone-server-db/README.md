# Milestone 2: Lifecycle Backbone (Server + DB)

## Overview
Implement core persistence and correctness model first: sessions, attempts, leases, stop intent, and stale-write protection.

## Dependencies
- [ ] Milestone 1: `m1-project-bootstrap-shared-contracts`

## Changes Required
- Model `sessions`, `session_attempts`, `session_events`, and `session_state` in Prisma with dedupe and ordering indexes.
- Add create/list/detail/stop/retry session routes with Zod validation.
- Add agent pull and heartbeat endpoints with attempt ownership semantics.
- Implement atomic lease claim/renewal and session stop/retry state transitions.
- Source plan section: [Phase 2 in `docs/plans/mvp.md`](../../mvp.md).

## Success Criteria

### Automated Verification
- [x] `npm run db:migrate`
- [x] `npm run test --workspace=apps/server`
- [x] `npm run typecheck --workspace=apps/server`

### Manual Verification
- [ ] Create session survives server restart
- [ ] Agent pull atomically claims one active attempt only
- [ ] Repeated stop calls are idempotent and session enters `stopping`

## Tasks
- [001-model-lifecycle-schema-and-migrations](./001-model-lifecycle-schema-and-migrations.md)
- [002-implement-lifecycle-and-agent-ownership-apis](./002-implement-lifecycle-and-agent-ownership-apis.md)
- [003-enforce-lease-session-semantics-and-tests](./003-enforce-lease-session-semantics-and-tests.md)
