# Milestone 14: Tooling Ladder, Write-Validate Loop, and Observability

## Overview
Add lower-cost read tools, reinforce write-then-validate iteration, and surface phase/budget context in UI and evals.

## Dependencies
- [ ] Milestone 13: `m13-runtime-exploration-budget-and-readiness-gate`

## Changes Required
- Add range-based file reads as a lower-cost discovery step.
- Implement targeted second-attempt behavior after failed patch validation.
- Update UI trace components and eval scenarios for phase and insufficient-context observability.
- Source plan sections: [Phase 3 and Phase 4 in `docs/plans/3-agent-exploration-and-edit-balance.md`](../../3-agent-exploration-and-edit-balance.md).

## Success Criteria

### Automated Verification
- [x] `npm run test --workspace=apps/agent`
- [x] `npm run test --workspace=apps/ui`
- [ ] `npm run eval:mvp`

### Manual Verification
- [ ] Typical tasks can use range reads before full-file reads
- [ ] Failed first patch can trigger one focused re-read and second edit attempt within budget
- [ ] UI clearly distinguishes exploration, editing, validation, and blocked outcomes

## Tasks
- [001-add-range-based-read-tooling](./001-add-range-based-read-tooling.md)
- [002-implement-write-then-validate-retry-loop](./002-implement-write-then-validate-retry-loop.md)
- [003-surface-phase-observability-in-ui-and-evals](./003-surface-phase-observability-in-ui-and-evals.md)
