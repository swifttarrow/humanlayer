# Task 001: Add Exploration Budget Accounting to Step Loop

## Goal
Implement runtime counters that cap exploration-only behavior and force transitions to patch, validation, or explicit blocker outcomes.

## Deliverables
- [ ] Configurable limits for exploration reads/searches/lines and exploration-only steps
- [ ] Budget accounting integrated into `apps/agent/src/runner/stepLoop.ts`
- [ ] Exhaustion path emits terminal semantics that are not `session.completed` without a write attempt

## Notes
Prefer configuration defaults that encourage progress while preserving safe first-pass context gathering.

## Verification
Run `npm run test --workspace=apps/agent` and verify budget exhaustion paths emit blocked/failed semantics.
