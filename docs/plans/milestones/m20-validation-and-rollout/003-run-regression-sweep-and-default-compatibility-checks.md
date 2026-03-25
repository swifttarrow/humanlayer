# Task 003: Run Regression Sweep and Default Compatibility Checks

## Goal
Validate full-system stability and backward-compatible defaults before rollout advancement.

## Deliverables
- [ ] Execute full test and lint suite with new capabilities disabled by default and capture baseline pass status.
- [ ] Execute targeted manual checks for legacy MVP workflows and confirm no required repo config/provider override for baseline usage.
- [ ] Record go/no-go checklist outcomes and unresolved risk items for release gating.

## Notes
Treat compatibility regressions as release blockers until mitigated with flags or fixes.

## Verification
Run `npm run test && npm run lint`, then complete the manual baseline walkthrough for legacy workflows.
