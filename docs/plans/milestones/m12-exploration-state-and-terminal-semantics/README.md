# Milestone 12: Exploration State and Terminal Semantics

## Overview
Add explicit phase and terminal semantics so exploration exhaustion is never reported as success.

## Dependencies
- [ ] Milestone 11: `m11-observability-evals-rollout-safety`

## Changes Required
- Extend shared contracts with blocked and phase-oriented event semantics.
- Update server event ingest derived-state logic for blocked/insufficient-context outcomes.
- Align session lifecycle service behavior for retry/stop on blocked terminal sessions.
- Source plan section: [Phase 1 in `docs/plans/3-agent-exploration-and-edit-balance.md`](../../3-agent-exploration-and-edit-balance.md).

## Success Criteria

### Automated Verification
- [x] `npm run test --workspace=packages/shared`
- [x] `npm run test --workspace=apps/server`

### Manual Verification
- [ ] Session terminal outcomes can distinguish `completed` vs `blocked`
- [ ] Terminal summary preserves insufficient-context reason details

## Tasks
- [001-extend-shared-status-and-event-contracts](./001-extend-shared-status-and-event-contracts.md)
- [002-map-blocked-and-phase-events-into-derived-state](./002-map-blocked-and-phase-events-into-derived-state.md)
