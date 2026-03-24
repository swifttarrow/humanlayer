# Task 001: Extend Session Create Validation and Errors

## Goal
Update session-create API validation to accept working-directory fields and return machine-readable failure reasons.

## Deliverables
- [x] `apps/server/src/routes/sessions.ts` accepts `workingDirectory` and optional `exposedSurfaces`
- [x] Invalid workdir payloads return reason-coded responses
- [x] Session create endpoint behavior remains backward compatible when field is omitted

## Notes
Use Zod for request validation and keep response format consistent with existing error handling conventions.

## Verification
Run server tests and manually POST invalid/valid payloads to `/sessions` to confirm response codes and reason payloads.
