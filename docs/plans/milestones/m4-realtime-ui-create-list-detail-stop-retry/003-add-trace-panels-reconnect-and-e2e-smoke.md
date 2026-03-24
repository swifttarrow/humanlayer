# Task 003: Add Trace Panels, Reconnect Handling, and E2E Smoke

## Goal
Complete trace observability UX and validate end-to-end create/run/stop/retry behavior with reconnect resilience.

## Deliverables
- [ ] `apps/ui/src/components/StructuredTrace.tsx` renders step/tool timeline as primary trace
- [ ] `apps/ui/src/components/RawEventsPanel.tsx` renders raw events fallback
- [ ] UI test coverage includes reconnect correctness and create -> run -> stop/retry smoke path

## Notes
Structured trace is primary UX; raw panel remains debugging fallback for edge cases.

## Verification
Run `npm run test --workspace=apps/ui` and execute smoke test covering reconnect and stop-semantic behavior.
