# Task 001: Build Workspace Layout and Changes Panel

## Goal
Evolve session detail from trace-first layout into a workspace with dedicated surfaces for steering, trace, and file changes.

## Deliverables
- [x] `apps/ui/src/pages/SessionDetailPage.tsx` introduces workspace panes/tabs for steering, trace, changes, and logs.
- [x] `apps/ui/src/components/ChangesPanel.tsx` renders grouped changed files and patch outcomes by attempt.
- [x] UI tests verify pane persistence and usability on long-running sessions.

## Notes
Retain current trace readability while adding richer navigation, rather than replacing trace UX outright.

## Verification
Run `npm run test --workspace=apps/ui` and validate users can quickly navigate changed files from active runs.
