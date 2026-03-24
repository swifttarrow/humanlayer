# Task 001: Add Shared Workdir Policy Contracts

## Goal
Add shared TypeScript contracts for working-directory input, normalized policy, and error semantics.

## Deliverables
- [ ] `packages/shared/src/contracts.ts` includes `workingDirectory` in create-session DTOs
- [ ] `packages/shared/src/contracts.ts` includes `WorkingDirectoryPolicy` and `ExposedSurface` interfaces
- [ ] Contract layer defines machine-readable reason codes for workdir validation failures

## Notes
Keep contract naming aligned with server and UI payload usage to avoid adapter code.

## Verification
Run `npm run typecheck --workspace=packages/shared` and confirm no downstream type regressions.
