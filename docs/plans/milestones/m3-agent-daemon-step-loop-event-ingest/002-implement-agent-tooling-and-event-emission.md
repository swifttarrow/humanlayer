# Task 002: Implement Agent Tooling and Event Emission

## Goal
Wire minimal coding tools into the agent and emit structured events for each meaningful execution boundary.

## Deliverables
- [ ] `apps/agent/src/tools/fileTools.ts`, `patchTool.ts`, and `shellTool.ts` implement the minimal toolset
- [ ] Step loop emits structured tool/step events with required IDs and sequence metadata

## Notes
Event payloads must match shared contracts and be suitable for append-only ingest and UI trace rendering.

## Verification
Execute a run that invokes tools and confirm event payload shape matches contract types.
