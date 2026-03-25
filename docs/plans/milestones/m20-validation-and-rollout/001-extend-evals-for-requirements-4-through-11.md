# Task 001: Extend Evals for Requirements 4 Through 11

## Goal
Map stretch-goals acceptance criteria into automated evaluator scenarios with deterministic assertions.

## Deliverables
- [ ] `apps/server/src/evals/mvpEvalRunner.ts` includes requirement-specific scenarios for runtime mode, steering, extensibility, CLI, UX, provider, and repo customization behavior.
- [ ] Eval assertions include policy and reason-code checks, not only happy-path completion.
- [ ] Eval fixtures/data are updated to cover at least one denial and one fallback path per major requirement cluster.

## Notes
Prefer explicit requirement IDs in eval names so failures map directly to docs and rollout decisions.

## Verification
Run `npm run eval:mvp` and confirm output reports requirement-level pass/fail mapping for requirements 4-11.
