# Task 002: Implement Lifecycle and Agent Ownership APIs

## Goal
Build server routes for session lifecycle and agent coordination with strict input validation.

## Deliverables
- [x] `apps/server/src/routes/sessions.ts` supports create/list/detail/stop/retry with Zod-validated inputs
- [x] `apps/server/src/routes/agents.ts` supports pull and heartbeat with explicit attempt-ownership responses

## Notes
Stop and retry handlers should be idempotent and compatible with lease/state rules enforced in services.

## Verification
Run server route tests and manually call endpoints to confirm expected lifecycle and ownership responses.
