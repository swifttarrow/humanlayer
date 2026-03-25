# Task 003: Implement Same-Run Steering, Approvals, and Runtime Gating

## Goal
Enable pause/resume and approval/clarification control flows on the active run without session forking.

## Deliverables
- [x] `apps/server/src/routes/sessions.ts` exposes pause/resume/approve/reject/clarification endpoints on existing session attempts.
- [x] `apps/agent/src/runner/stepLoop.ts` gates scheduling by run-control state and yields for clarification/approval when required.
- [x] `apps/server/src/services/eventIngestService.ts` and `apps/ui/src/pages/SessionDetailPage.tsx` project and render steering/approval timeline events.

## Notes
Use complete-current-step-then-hold semantics for pause to avoid tool-specific cancellation complexity.

## Verification
Run `npm run test --workspace=apps/server && npm run test --workspace=apps/agent && npm run test --workspace=apps/ui` and verify same-run pause/resume and approval blocking behavior.
