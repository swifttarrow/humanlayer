# Task 002: Build Sessions UI List/Create/Detail Controls

## Goal
Implement core UI workflows for creating sessions, viewing session lists, and operating stop/retry controls on session detail, aligned with `humanlayer.pen` designs.

## Deliverables
- [ ] `apps/ui/src/pages/SessionsPage.tsx` implements list and create flow
- [ ] `apps/ui/src/pages/SessionDetailPage.tsx` implements state view, active step display, stop action, and retry action
- [ ] UI implementation includes design-parity pass against `humanlayer.pen` for layout and core interactions

## Notes
Keep business logic close to server contracts and avoid embedding lifecycle state rules directly in presentation components. Treat `humanlayer.pen` as the visual/interaction source of truth for this task.

## Verification
Manual flow check: create session, observe run state, issue stop/retry actions, and confirm expected status transitions. Verify implemented UI against `humanlayer.pen` screens before task closeout.
