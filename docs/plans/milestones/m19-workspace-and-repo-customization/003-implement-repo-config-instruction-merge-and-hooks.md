# Task 003: Implement Repo Config, Instruction Merge, and Hooks

## Goal
Introduce deterministic repo-scoped customization with explicit trust modes and auditable hook execution.

## Deliverables
- [x] `packages/shared/src/repoConfig.ts` defines versioned repo config schema and merge metadata.
- [x] `apps/agent/src/config/repoConfigLoader.ts` and `apps/agent/src/config/instructionMerger.ts` implement deterministic discovery and instruction merge ordering.
- [x] `apps/agent/src/hooks/hookRunner.ts` and `apps/server/src/services/eventIngestService.ts` execute/report setup and validation hooks with trust-policy reason codes.

## Notes
Default to restricted behavior unless trust policy explicitly allows broader execution.

## Verification
Run `npm run test --workspace=apps/agent && npm run test --workspace=packages/shared` and validate hook lifecycle and trust-mode gating behavior.
