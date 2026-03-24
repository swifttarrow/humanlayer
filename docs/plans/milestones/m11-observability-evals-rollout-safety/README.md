# Milestone 11: Observability, Evals, and Rollout Safety

## Overview
Add runtime visibility, regression checks, and rollout guardrails for the new policy behavior.

## Dependencies
- [ ] Milestone 10: `m10-docker-surfaces-runtime-isolation`

## Changes Required
- Emit structured signals for denied operations and startup policy validation.
- Extend eval runner/spec with working-directory and local-vs-docker parity scenarios.
- Record major rollout decisions in developer log.
- Source plan section: [Phase 6 in `docs/plans/2-working-directory.md`](../../2-working-directory.md).

## Success Criteria

### Automated Verification
- [ ] `npm run eval:mvp`
- [ ] `npm run test`

### Manual Verification
- [ ] Session metadata clearly shows resolved workdir + exposed surfaces
- [ ] Denied accesses are visible and debuggable from session history
- [ ] No regressions in existing lifecycle, stop, and SSE behaviors

## Tasks
- [001-add-policy-observability-events](./001-add-policy-observability-events.md)
- [002-extend-evals-and-log-rollout-decisions](./002-extend-evals-and-log-rollout-decisions.md)
