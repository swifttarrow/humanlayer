# Requirement: Tool Extensibility with Browser and MCP Integrations

## Summary

The agent platform must support a pluggable tool system that extends beyond built-in file and shell tools, including first-class browser automation and MCP server integrations.

The goal is to enable capabilities such as web interaction, external system access, and custom organization-specific tooling with policy controls and observability.

## Problem

Current agent capabilities are constrained to a small built-in toolset.

This limits real-world utility:

- no native browser-driven workflows
- no external tool invocation via standardized integration protocol
- no path for teams to add custom capabilities without core runtime changes

## Scope

This requirement defines:

- extensible tool registration and discovery
- MCP server connection and tool invocation
- browser tool category support
- policy, security, and auditing for external tools

This requirement does not define every individual MCP tool implementation.

## User Stories

### Primary

As a user, I want the agent to use browser and external tools when needed so it can complete tasks that exceed local file edits.

### Platform

As an integrator, I want to register custom tool providers without modifying core step-loop logic.

### Safety

As an admin, I want clear allow/deny controls and audit logs for external tool usage.

## Functional Requirements

## 1. Tool Provider Abstraction

The runtime must support a provider model where tools are sourced from:

- built-in tools
- browser tool provider
- MCP-backed providers

The step loop must operate against a shared `ToolRegistry` contract rather than hard-coded tool lists.

## 2. Dynamic Tool Discovery

At run initialization, the runtime must discover and publish available tools based on:

- environment configuration
- authenticated providers
- policy filters

Each discovered tool must include:

- stable tool ID
- display name and description
- input schema
- capability category
- risk classification

## 3. MCP Integration

The system must support connecting to one or more MCP servers and exposing MCP tools to the agent.

MCP integration must include:

- server-level authentication flow where required
- health checks and connection status visibility
- per-server and per-tool allowlisting
- structured error mapping for unavailable or unauthorized tools

## 4. Browser Capability Category

The system must support browser-capable tools as a first-class category.

At minimum, browser category must support:

- navigation
- snapshot/DOM introspection
- interaction primitives (click/type/select)

The runtime must treat browser actions as policy-governed external actions, not ordinary local file operations.

## 5. Policy and Permissions

Tool usage must be controlled by policy at:

- provider level
- tool level
- optional argument constraints for high-risk parameters

Policy decisions must be evaluated before invocation and logged with reason metadata.

## 6. Invocation Lifecycle and Reliability

Every tool call must emit lifecycle events:

- requested
- approved (or denied)
- started
- completed (or failed)

Failures must distinguish:

- provider unavailable
- tool not found
- schema validation failure
- policy denied
- execution timeout

## 7. UX Surface

The session UI must show:

- tool source (built-in, browser, MCP server name)
- invocation status and duration
- denial/failure reason codes

Users should be able to inspect tool input/output payloads subject to redaction policy.

## Acceptance Criteria

1. Built-in and provider-sourced tools are all exposed through a shared runtime registry.
2. At least one MCP server can be connected and its tools made available to runs.
3. Tool availability in a run reflects policy allowlisting and auth state.
4. Browser tools are available as a distinct capability category and can be policy-gated.
5. Tool invocation events capture source, lifecycle stage, and reason codes for denials/failures.
6. Step-loop code no longer hard-wires the complete tool list inline.

## Implementation Notes

- Start with read-only MCP tools and expand to mutating tools behind stricter policy flags.
- Keep tool input/output schema validation centralized to avoid provider-specific drift.
- Prefer capability tags (`filesystem`, `browser`, `external_api`) for consistent policy rules.

## Open Questions

- Should MCP servers be configured globally, per-user, or per-repo by default?
- How should secrets redaction be applied for external tool payload logging?
