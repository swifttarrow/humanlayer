# Task 002: Extend Evals and Log Rollout Decisions

## Goal
Protect rollout quality by adding eval scenarios and recording major implementation decisions.

## Deliverables
- [x] `apps/server/src/evals/mvpEvalRunner.ts` includes workdir validation and parity scenarios
- [x] `docs/evals/mvp-eval-spec.md` documents new scenarios and expected outcomes
- [x] `docs/developer-log.md` includes major decisions and rollout tradeoffs for this feature set

## Notes
Keep eval scenarios deterministic where possible; clearly separate must-pass from observational checks.

## Verification
Run `npm run eval:mvp` and review output for new scenario coverage and pass/fail reporting.
