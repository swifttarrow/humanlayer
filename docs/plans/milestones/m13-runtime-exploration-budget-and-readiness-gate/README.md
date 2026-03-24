# Milestone 13: Runtime Exploration Budget and Readiness Gate

## Overview
Enforce bounded exploration with explicit readiness criteria before deep reads, then require write/validate/escalate transitions.

## Dependencies
- [ ] Milestone 12: `m12-exploration-state-and-terminal-semantics`

## Changes Required
- Add runtime exploration budget accounting in the step loop.
- Add edit-readiness hypothesis tracking with concrete uncertainty reasons.
- Prevent max-step/budget exhaustion from being reported as completed when no write attempt occurred.
- Source plan section: [Phase 2 in `docs/plans/3-agent-exploration-and-edit-balance.md`](../../3-agent-exploration-and-edit-balance.md).

## Success Criteria

### Automated Verification
- [x] `npm run test --workspace=apps/agent`
- [x] `npm run typecheck --workspace=apps/agent`

### Manual Verification
- [ ] Long read/search-only sessions transition to patch/escalate instead of silent completion
- [ ] Exploration follow-up reads include explicit rationale in emitted metadata

## Tasks
- [001-add-exploration-budget-accounting-to-step-loop](./001-add-exploration-budget-accounting-to-step-loop.md)
- [002-emit-edit-readiness-hypothesis-and-transition-rules](./002-emit-edit-readiness-hypothesis-and-transition-rules.md)
