# Task 002: Wire API Payload and UI Error Handling

## Goal
Send working-directory fields in create-session requests and display server validation failures clearly.

## Deliverables
- [x] `apps/ui/src/api.ts` request typings include `workingDirectory` and optional `exposedSurfaces`
- [x] `apps/ui/src/pages/SessionsPage.tsx` or related submit flow sends workdir payload unchanged
- [x] `apps/ui/src/__tests__/new-session.test.tsx` verifies failure feedback and retry behavior

## Notes
Display reason code and message when available; preserve entered values after failed requests.

## Verification
Run `npm run test --workspace=apps/ui` and validate form retry flow with an intentionally invalid path.
