# Milestone 4: Realtime + UI (Create/List/Detail/Stop/Retry)

## Overview
Implement user-facing experience: structured trace, live updates via SSE, and reliable reconnect behavior.

## Dependencies
- [ ] Milestone 3: `m3-agent-daemon-step-loop-event-ingest`

## Changes Required
- Add SSE stream endpoint with initial snapshot plus replay from last sequence.
- Build sessions list page and session creation flow based on `humanlayer.pen` designs.
- Build session detail page with current state, active step, and stop/retry controls based on `humanlayer.pen` designs.
- Add structured trace timeline and raw events fallback panel.
- Source plan section: [Phase 4 in `docs/plans/mvp.md`](../../mvp.md).

## Success Criteria

### Automated Verification
- [ ] `npm run test --workspace=apps/ui`
- [ ] `npm run typecheck --workspace=apps/ui`
- [ ] End-to-end smoke test for create -> run -> stop/retry

### Manual Verification
- [ ] Session list shows status + updated time + terminal outcome
- [ ] Detail page updates live without refresh
- [ ] Stream reconnect restores correctness using snapshot + replay
- [ ] Stop semantics match PRD (no new step begins after acceptance)
- [ ] Sessions and detail UI match `humanlayer.pen` screens (layout, key interactions, and component intent)

## Tasks
- [001-implement-sse-snapshot-replay-stream](./001-implement-sse-snapshot-replay-stream.md)
- [002-build-sessions-ui-list-create-detail-controls](./002-build-sessions-ui-list-create-detail-controls.md)
- [003-add-trace-panels-reconnect-and-e2e-smoke](./003-add-trace-panels-reconnect-and-e2e-smoke.md)
