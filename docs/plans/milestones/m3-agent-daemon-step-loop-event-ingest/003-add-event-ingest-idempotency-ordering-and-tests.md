# Task 003: Add Event Ingest Idempotency, Ordering, and Tests

## Goal
Implement server-side event ingestion that rejects stale attempts, deduplicates by event ID, and preserves canonical ordering.

## Deliverables
- [ ] `apps/server/src/routes/events.ts` ingests event batches and validates attempt ownership
- [ ] `apps/server/src/services/eventIngestService.ts` enforces `event_id` dedupe and `sequence_number` ordering transactionally
- [ ] Contract tests cover duplicate `event_id` and stale `attempt_id` writes

## Notes
Derived session state updates should occur in the same transaction as accepted event writes.

## Verification
Run server/agent tests and manually replay duplicate and stale events to confirm no incorrect persistence.
