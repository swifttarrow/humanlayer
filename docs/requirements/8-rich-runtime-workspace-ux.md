# Requirement: Rich Runtime Workspace UX

## Summary

The session experience must evolve from primarily trace-centric inspection to a workspace-centric runtime UX that supports active development workflows during execution.

Users should be able to work across chat, changes, terminal output, app preview, and workspace views without losing run context.

## Problem

Current UI strengths are in trace inspection and event visibility, but runtime work remains fragmented.

This creates gaps:

- difficult to move from "what happened" to "what should I do next"
- no unified workspace surface for reviewing and acting on agent outputs
- slower iteration for debugging and validation during a run

## Scope

This requirement defines:

- runtime workspace information architecture
- multi-pane views for execution and artifacts
- interaction flows that connect traces to actionable workspace context

This requirement does not define final visual design language.

## User Stories

### Primary

As a developer, I want a unified runtime workspace so I can review changes, inspect terminal output, and validate app behavior in one place.

### Debugging

As a user, I want to pivot directly from a trace event to related files and runtime outputs to troubleshoot faster.

### Confidence

As a reviewer, I want clear visibility into what changed and what was validated before accepting results.

## Functional Requirements

## 1. Workspace-Centric Layout

The session detail experience must support a workspace-oriented layout with at least:

- chat/steering view
- change view (diffs/patches)
- terminal/log view
- runtime preview view (when available)
- trace timeline view

Views may be tabbed or pane-based, but fast switching must preserve run context.

## 2. Trace-to-Workspace Linking

Trace entries must deep-link to relevant workspace artifacts where applicable:

- tool calls to files or command outputs
- patch events to diff sections
- errors to logs and affected files

Links must include stable identifiers so reload does not break navigation.

## 3. Changes View

The UI must provide a first-class changes view that shows:

- grouped file changes per attempt
- patch status and apply result
- easy navigation between changed files

The changes view must remain available after run completion.

## 4. Terminal and Runtime Output View

The UI must present command output with:

- chronological stream
- command boundaries
- status and exit codes

For long outputs, the UI should support search and truncation safeguards.

## 5. Preview/Browser Surface (Optional by Capability)

When runtime supports app preview or browser tooling, the session UI should expose an embedded preview surface tied to the active run.

If unavailable, the UI must degrade gracefully with explicit "capability unavailable" messaging.

## 6. State and Performance

The workspace UX must handle large runs without blocking core interactions.

The system should use incremental loading/virtualization for long trace and log streams.

## 7. Accessibility and Keyboard Flow

Core runtime views must be keyboard navigable.

Focus order and status updates must remain accessible during live streaming updates.

## Acceptance Criteria

1. Session detail includes distinct surfaces for chat, changes, logs/terminal, and trace timeline.
2. Users can navigate from trace events directly to related diffs or logs.
3. Changed files and patch outcomes are visible in a dedicated changes surface.
4. Terminal output shows command boundaries and exit status.
5. Long traces and logs remain responsive through incremental rendering or virtualization.
6. Capability-dependent views (preview/browser) fail gracefully when not enabled.

## Implementation Notes

- Reuse existing trace data model, but add view-specific selectors for workspace panels.
- Introduce stable artifact IDs to connect trace nodes, diffs, and logs.
- Prefer progressive enhancement: ship core workspace panes first, then advanced embedded views.

## Open Questions

- Should workspace pane configuration be user-customizable and persisted per user?
- What is the MVP boundary between embedded editor support and simple diff/file viewers?
