# Milestone 20: Validation and Rollout

## Overview
Close the stretch-goals program with requirement-mapped evals, rollout controls, and regression safeguards before default-on behavior changes.

## Dependencies
- [ ] Milestone 19: `m19-workspace-and-repo-customization`

## Changes Required
- Extend evaluator scenarios to cover requirements 4-11 acceptance and reason-code assertions.
- Document an explicit requirement-to-test matrix and rollout/migration controls.
- Validate backward-compatible defaults and run full regression sweeps before enabling stricter policies.
- Source plan section: [Phase 8 in `docs/plans/4-stretch-goals.md`](../../4-stretch-goals.md).

## Success Criteria

### Automated Verification
- [ ] `npm run eval:mvp`
- [x] `npm run test`
- [ ] `npm run lint`

### Manual Verification
- [ ] Baseline workflows still function with default settings.
- [ ] New capabilities are gated behind documented config and policy controls.
- [ ] Requirements 4-11 acceptance criteria are demonstrably satisfied.

## Tasks
- [001-extend-evals-for-requirements-4-through-11](./001-extend-evals-for-requirements-4-through-11.md)
- [002-document-requirement-matrix-and-rollout-controls](./002-document-requirement-matrix-and-rollout-controls.md)
- [003-run-regression-sweep-and-default-compatibility-checks](./003-run-regression-sweep-and-default-compatibility-checks.md)
