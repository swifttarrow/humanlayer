# Milestone 16: Runtime Mode and Steering

## Overview
Deliver requirement 4 and requirement 5 behavior: runtime mode + workdir parity at session creation, plus same-run pause/resume, approvals, and clarification flows.

## Dependencies
- [ ] Milestone 15: `m15-policy-and-selection-core`

## Changes Required
- Extend server runtime/workdir validation and session metadata persistence for selected vs effective mode and canonical path details.
- Add UI session-creation parity for runtime mode selection, exposed surfaces, and first-class workdir feedback.
- Add same-run run-control APIs and runtime gating for pause/resume, approval/rejection, and clarification responses.
- Source plan sections: [Phase 2 and Phase 3 in `docs/plans/4-stretch-goals.md`](../../4-stretch-goals.md).

## Success Criteria

### Automated Verification
- [x] `npm run test --workspace=apps/server`
- [x] `npm run test --workspace=apps/agent`
- [x] `npm run test --workspace=apps/ui`

### Manual Verification
- [ ] Dual-mode sessions allow explicit local/docker choice with correct policy messaging.
- [ ] Same run ID supports pause/resume and approval workflows without creating a new session.
- [ ] Timeline shows clarification prompts/responses and approval decisions with actor/timestamp context.

## Tasks
- [001-extend-runtime-mode-and-workdir-server-foundations](./001-extend-runtime-mode-and-workdir-server-foundations.md)
- [002-add-runtime-and-workdir-ux-parity-in-new-session-flow](./002-add-runtime-and-workdir-ux-parity-in-new-session-flow.md)
- [003-implement-same-run-steering-approvals-and-runtime-gating](./003-implement-same-run-steering-approvals-and-runtime-gating.md)
