# Task 001: Add Range-Based Read Tooling

## Goal
Introduce bounded file-read capabilities so the agent can inspect targeted sections before requesting full file content.

## Deliverables
- [x] `apps/agent/src/tools/fileTools.ts` supports line-range reads with safe limits
- [x] `apps/agent/src/runner/stepLoop.ts` exposes and handles range-read tool calls
- [x] Tests cover range-read boundaries and fallback behavior

## Notes
Keep full-file read support for compatibility, but bias prompt/runtime guidance toward cheap discovery first.

## Verification
Run `npm run test --workspace=apps/agent` and confirm range reads work for targeted context gathering.
