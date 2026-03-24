# Milestone 3: Agent Daemon + Step Loop + Event Ingest

## Overview
Add a runnable outbound-only agent and canonical append-only event ingest with idempotency and ordering checks.

## Dependencies
- [ ] Milestone 2: `m2-lifecycle-backbone-server-db`

## Changes Required
- Add agent CLI startup loop for polling, claiming, and running attempts.
- Implement step-based execution with stop checks between steps.
- Implement minimal coding toolset adapters (search/read, patch, shell execution).
- Add server event ingestion endpoint with ownership checks and transactional dedupe/ordering enforcement.
- Source plan section: [Phase 3 in `docs/plans/mvp.md`](../../mvp.md).

## Success Criteria

### Automated Verification
- [ ] `npm run test --workspace=apps/agent`
- [ ] `npm run test --workspace=apps/server`
- [ ] Contract tests for duplicate `event_id` and stale `attempt_id`

### Manual Verification
- [ ] Running session emits visible step/tool events
- [ ] Duplicate event submissions do not duplicate persisted truth
- [ ] Lease-expired attempt cannot write new events

## Tasks
- [001-build-agent-daemon-and-step-loop](./001-build-agent-daemon-and-step-loop.md)
- [002-implement-agent-tooling-and-event-emission](./002-implement-agent-tooling-and-event-emission.md)
- [003-add-event-ingest-idempotency-ordering-and-tests](./003-add-event-ingest-idempotency-ordering-and-tests.md)
