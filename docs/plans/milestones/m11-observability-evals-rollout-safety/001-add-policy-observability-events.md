# Task 001: Add Policy Observability Events

## Goal
Emit and persist policy-focused metadata and denied-access signals for auditing and debugging.

## Deliverables
- [ ] Server and/or agent event flow includes structured denied-access events
- [ ] Run/session metadata captures resolved workdir and exposed-surface policy
- [ ] Event visibility and payload shape are documented for UI/debug consumption

## Notes
Coordinate event naming with existing `SessionEventType` conventions to avoid schema drift.

## Verification
Run a session with an intentionally denied operation and confirm event trace captures the denial details.
