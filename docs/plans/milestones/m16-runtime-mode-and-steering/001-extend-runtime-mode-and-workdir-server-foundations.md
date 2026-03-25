# Task 001: Extend Runtime Mode and Workdir Server Foundations

## Goal
Make runtime-mode policy and workdir validation authoritative in server-side session setup.

## Deliverables
- [x] `apps/server/src/services/workdirPolicyService.ts` emits typed runtime-mode denial/unavailable errors with guidance.
- [x] `apps/server/src/services/sessionService.ts` persists selected mode, effective mode, entered path, and canonical path metadata.
- [x] Server tests cover mode-policy branches and canonicalization persistence behavior.

## Notes
Use resolver outputs from milestone 15 as the single source of truth for effective mode selection.

## Verification
Run `npm run test --workspace=apps/server` and validate session metadata exposes selected/effective mode plus canonical path details.
