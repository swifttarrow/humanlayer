# Task 003: Define JSONL Contract and CLI Docs

## Goal
Standardize machine-readable run output for automation and document the CLI interface clearly.

## Deliverables
- [x] `apps/cli/src/jsonl.ts` defines a versioned JSONL event schema for lifecycle, tool, approval, and error events.
- [x] CLI tests validate emitted JSONL line shape and version compatibility behavior.
- [x] `README.md` documents CLI usage, headless examples, JSONL schema notes, and exit-code table.

## Notes
Version JSONL explicitly to support additive evolution without breaking automation clients.

## Verification
Run `npm run test --workspace=apps/cli` and confirm emitted JSONL validates against the documented schema.
