# Task 001: Add Shared Selection and Policy Contracts

## Goal
Define shared contract types and reason-code envelopes so all selection paths use a common schema.

## Deliverables
- [x] `packages/shared/src/contracts.ts` includes runtime mode policy (`local_only`, `docker_only`, `dual_mode`) and typed selection failure envelopes.
- [x] Approval, pause/resume, provider/model selection, and tool/provider metadata contracts are added for downstream consumers.
- [x] Contract changes are covered by shared package typecheck and any required contract tests.

## Notes
Keep naming compatible with existing event and status semantics so server and agent upgrades can be incremental.

## Verification
Run `npm run typecheck --workspace=packages/shared` and confirm downstream packages compile against the updated contract surface.
