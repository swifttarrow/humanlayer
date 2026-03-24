# Task 001: Add Workdir Inputs to New Session Form

## Goal
Expose working-directory configuration controls in the session creation UI.

## Deliverables
- [x] `apps/ui/src/pages/NewSessionPage.tsx` includes a `working_directory` input
- [x] Optional exposed-surfaces controls are available when configured
- [x] Form state persists entered values across submit attempts

## Notes
Keep UX simple and avoid client-side policy duplication; server remains validation authority.

## Verification
Run UI and confirm users can enter/edit workdir values prior to submission.
