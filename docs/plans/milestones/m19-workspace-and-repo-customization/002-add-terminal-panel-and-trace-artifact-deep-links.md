# Task 002: Add Terminal Panel and Trace Artifact Deep Links

## Goal
Make runtime logs and trace events directly navigable by introducing a terminal panel and artifact deep-link mapping.

## Deliverables
- [ ] `apps/ui/src/components/TerminalPanel.tsx` renders command boundaries, statuses, and searchable output streams.
- [ ] `apps/ui/src/components/StructuredTrace.tsx` links trace items to stable artifact IDs in changes/log panels.
- [ ] UI typecheck/tests cover deep-link routing and capability-dependent preview fallback behavior.

## Notes
Use stable artifact identifiers so deep links remain valid across reconnects and replayed traces.

## Verification
Run `npm run typecheck --workspace=apps/ui && npm run test --workspace=apps/ui` and confirm trace-to-artifact navigation works consistently.
