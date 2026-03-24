# Task 003: Surface Phase Observability in UI and Evals

## Goal
Make exploration/edit/validation progress and insufficient-context outcomes visible and testable.

## Deliverables
- [ ] `apps/ui/src/components/StructuredTrace.tsx` renders phase and blocked semantics
- [ ] `apps/ui/src/components/RawEventsPanel.tsx` supports new phase/terminal event labels
- [ ] `apps/server/src/evals/mvpEvalRunner.ts` and `docs/evals/mvp-eval-spec.md` include requirement acceptance checks

## Notes
Event payloads should stay machine-readable so UI and eval assertions avoid brittle natural-language parsing.

## Verification
Run `npm run test --workspace=apps/ui` and `npm run eval:mvp` to verify observability and regression coverage.
