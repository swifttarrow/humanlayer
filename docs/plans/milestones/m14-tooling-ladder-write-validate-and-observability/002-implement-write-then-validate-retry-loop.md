# Task 002: Implement Write-Then-Validate Retry Loop

## Goal
Ensure first credible edits are attempted promptly, with one focused recovery loop when the first patch attempt fails.

## Deliverables
- [x] Step loop transitions from exploration to patch once readiness conditions are met
- [x] Validation failures permit one targeted follow-up exploration and second patch attempt within budget
- [x] Terminal summaries distinguish "no credible target", "insufficient context", and "patch attempted but not validated"

## Notes
Prioritize narrow, testable patches over continued speculative reading.

## Verification
Run `npm run test --workspace=apps/agent` and validate failure-recovery paths in step loop tests.
