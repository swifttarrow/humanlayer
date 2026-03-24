# Task 001: Build Agent Daemon and Step Loop

## Goal
Create the outbound-only agent process that polls for work, claims attempts, and executes step-bounded runs.

## Deliverables
- [ ] `apps/agent/src/main.ts` boots the polling/claiming loop and attempt runner
- [ ] `apps/agent/src/runner/stepLoop.ts` executes discrete steps with stop checks between boundaries

## Notes
Keep boundaries explicit so stop semantics can prevent new steps after stop acceptance.

## Verification
Run agent tests and verify a sample session emits step-start and step-end lifecycle events.
