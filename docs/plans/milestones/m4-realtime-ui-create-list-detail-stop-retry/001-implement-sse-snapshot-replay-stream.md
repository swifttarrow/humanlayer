# Task 001: Implement SSE Snapshot and Replay Stream

## Goal
Provide a server stream endpoint that delivers initial state plus ordered replay for reconnect-safe realtime updates.

## Deliverables
- [ ] `apps/server/src/routes/stream.ts` serves SSE with initial snapshot and replay from client-provided last sequence
- [ ] Stream contract supports reconnect without data loss or ordering drift

## Notes
Use the append-only event model as source of truth for replay behavior.

## Verification
Manually disconnect/reconnect a stream client and verify state catches up correctly with no missing events.
