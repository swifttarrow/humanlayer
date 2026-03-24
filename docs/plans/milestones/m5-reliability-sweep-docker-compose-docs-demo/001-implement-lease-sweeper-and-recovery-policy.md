# Task 001: Implement Lease Sweeper and Recovery Policy

## Goal
Add reliability handling for expired attempt leases and ensure sessions transition into recoverable/stalled states per policy.

## Deliverables
- [ ] `apps/server/src/jobs/leaseSweeper.ts` detects expired leases and applies policy transitions
- [ ] Sweeper behavior is tested for expected state outcomes

## Notes
Align failure-state transitions with lifecycle correctness and retry semantics from the PRD.

## Verification
Simulate expired lease scenarios and confirm stale attempts cannot continue writing events.
