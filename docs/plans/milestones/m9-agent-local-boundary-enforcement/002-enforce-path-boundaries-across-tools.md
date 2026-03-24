# Task 002: Enforce Path Boundaries Across Tools

## Goal
Apply policy checks consistently to file search/read, patch writes, and shell execution.

## Deliverables
- [ ] `apps/agent/src/tools/workspacePolicy.ts` added with canonical path guards
- [ ] `apps/agent/src/tools/fileTools.ts`, `patchTool.ts`, and `shellTool.ts` enforce readable/writable boundaries
- [ ] `apps/agent/src/__tests__/stepLoop.test.ts` includes denied-access test coverage

## Notes
Denied operations should fail clearly and be suitable for emission into event traces.

## Verification
Run agent tests and manually attempt out-of-bounds read/write actions to confirm rejection behavior.
