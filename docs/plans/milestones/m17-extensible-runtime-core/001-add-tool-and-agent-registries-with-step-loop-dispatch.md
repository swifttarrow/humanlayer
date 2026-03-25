# Task 001: Add Tool and Agent Registries with Step-Loop Dispatch

## Goal
Replace hard-coded runtime wiring with explicit registry-backed dispatch for tools and agent types.

## Deliverables
- [x] `apps/agent/src/runner/toolRegistry.ts` registers built-in tools with metadata and validation hooks.
- [x] `apps/agent/src/runner/agentRegistry.ts` maps `agentType` values to shared runtime implementations.
- [x] `apps/agent/src/runner/stepLoop.ts` routes tool and agent execution via registries rather than inline mappings.

## Notes
Keep adapter layering incremental so existing default flows remain operational during migration.

## Verification
Run `npm run test --workspace=apps/agent` and confirm default and alternate agent/tool paths both dispatch correctly.
