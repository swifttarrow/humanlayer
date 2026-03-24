# Task 002: Emit Edit-Readiness Hypothesis and Transition Rules

## Goal
Require a concrete edit hypothesis before repeated deep reads and track why further context is needed.

## Deliverables
- [x] Structured hypothesis fields (candidate file, planned change, uncertainty reason) emitted in events
- [x] Deep/repeated read gating tied to concrete uncertainty categories
- [x] Tests covering transitions from exploring to editing or blocked

## Notes
Use small, machine-readable payloads so UI and evals can consume phase intent without brittle parsing.

## Verification
Run `npm run test --workspace=apps/agent` and confirm readiness metadata appears before repeated deep reads.
