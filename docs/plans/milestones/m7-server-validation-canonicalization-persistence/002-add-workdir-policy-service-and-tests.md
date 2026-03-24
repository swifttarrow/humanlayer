# Task 002: Add Workdir Policy Service and Tests

## Goal
Implement canonical path resolution and policy enforcement logic in a dedicated server service with targeted unit coverage.

## Deliverables
- [ ] `apps/server/src/services/workdirPolicyService.ts` added with canonicalization and allowlist checks
- [ ] `apps/server/src/services/sessionService.ts` calls policy service and persists normalized policy metadata
- [ ] `apps/server/src/__tests__/workdirPolicyService.test.ts` and `apps/server/src/__tests__/sessionService.test.ts` cover accept/reject paths

## Notes
Include traversal and symlink-target checks so policy decisions are based on canonical paths.

## Verification
Run `npm run test --workspace=apps/server` and confirm test cases for not-found, not-directory, and not-allowed paths pass.
