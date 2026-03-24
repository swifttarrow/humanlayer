# Task 001: Extend Shared Status and Event Contracts

## Goal
Define shared lifecycle primitives for exploration/edit/validation phases and insufficient-context terminal outcomes.

## Deliverables
- [x] `SessionStatus` includes `blocked` in `packages/shared/src/contracts.ts`
- [x] `SessionEventType` includes phase and insufficient-context event types needed for observability
- [x] Contract comments document required terminal summary payload fields

## Notes
Prefer additive contracts and backward-compatible parsing in consumers to reduce rollout risk.

## Verification
Run `npm run test --workspace=packages/shared` and confirm shared type consumers compile cleanly.
