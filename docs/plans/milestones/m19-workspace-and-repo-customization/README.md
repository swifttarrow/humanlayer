# Milestone 19: Workspace and Repo Customization

## Overview
Deliver workspace-centric runtime UX and repo-level configuration/instruction/hook customization with explicit trust controls and auditability.

## Dependencies
- [ ] Milestone 18: `m18-cli-and-integrations`

## Changes Required
- Expand session detail into a workspace layout with linked trace, changes, and terminal/log surfaces.
- Add deep-linking from trace events to related artifacts (file diffs/log blocks).
- Implement repo config schema/loader, instruction merge ordering, and policy-gated setup/validation hooks with event visibility.
- Source plan sections: [Phase 6 and Phase 7 in `docs/plans/4-stretch-goals.md`](../../4-stretch-goals.md).

## Success Criteria

### Automated Verification
- [ ] `npm run test --workspace=apps/ui`
- [ ] `npm run typecheck --workspace=apps/ui`
- [ ] `npm run test --workspace=apps/agent`
- [ ] `npm run test --workspace=packages/shared`

### Manual Verification
- [ ] Users can pivot from timeline events to related changes/log artifacts in one click.
- [ ] Long-run changes/log views remain navigable and searchable.
- [ ] Repo config and hook lifecycle events are visible with clear trust/policy reason codes.

## Tasks
- [001-build-workspace-layout-and-changes-panel](./001-build-workspace-layout-and-changes-panel.md)
- [002-add-terminal-panel-and-trace-artifact-deep-links](./002-add-terminal-panel-and-trace-artifact-deep-links.md)
- [003-implement-repo-config-instruction-merge-and-hooks](./003-implement-repo-config-instruction-merge-and-hooks.md)
