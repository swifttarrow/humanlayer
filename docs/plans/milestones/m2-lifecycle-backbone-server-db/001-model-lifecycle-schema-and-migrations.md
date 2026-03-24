# Task 001: Model Lifecycle Schema and Migrations

## Goal
Implement the core Prisma data model for sessions, attempts, events, and derived session state with correct keys and indexes.

## Deliverables
- [x] `apps/server/prisma/schema.prisma` includes `sessions`, `session_attempts`, `session_events`, and `session_state`
- [x] Uniques/indexes cover dedupe (`event_id`) and ordering/lookup needs
- [x] Migration artifacts are created and runnable

## Notes
Prioritize constraints required for idempotent ingest and stale-attempt protection in later phases.

## Verification
Run `npm run db:migrate` and verify schema and migration complete successfully.
