# Task 002: Add Runtime and Workdir UX Parity in New Session Flow

## Goal
Surface runtime choice and working-directory controls as first-class UI inputs with clear validation feedback.

## Deliverables
- [ ] `apps/ui/src/pages/NewSessionPage.tsx` includes conditional runtime mode selector, exposed surfaces editor, and improved workdir presets/recent behavior.
- [ ] `apps/ui/src/pages/SessionDetailPage.tsx` shows selected/effective runtime mode and entered/canonical path summary metadata.
- [ ] `apps/ui/src/__tests__/new-session.test.tsx` covers mode selection submission and inline policy/validation errors.

## Notes
Keep behavior backward-compatible when policy is not dual mode by hiding selector and preserving defaults.

## Verification
Run `npm run test --workspace=apps/ui` and confirm runtime/workdir validation feedback is visible before run start.
