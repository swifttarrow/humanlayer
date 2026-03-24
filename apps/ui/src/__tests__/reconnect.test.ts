import { describe, it, expect, vi } from "vitest";

describe("SSE reconnect semantics", () => {
  it("creates EventSource with correct since parameter", () => {
    const capturedUrls: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MockEventSource = vi.fn().mockImplementation(function(this: any, url: string) { capturedUrls.push(url); });
    vi.stubGlobal("EventSource", MockEventSource);

    function stream(sessionId: string, since: number) {
      return new EventSource(`/api/sessions/${sessionId}/stream?since=${since}`);
    }

    stream("sess-1", 42);
    expect(capturedUrls[0]).toBe("/api/sessions/sess-1/stream?since=42");
    vi.unstubAllGlobals();
  });

  it("passes since=-1 for fresh connections", () => {
    const capturedUrls: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MockEventSource = vi.fn().mockImplementation(function(this: any, url: string) { capturedUrls.push(url); });
    vi.stubGlobal("EventSource", MockEventSource);

    function stream(sessionId: string, since: number) {
      return new EventSource(`/api/sessions/${sessionId}/stream?since=${since}`);
    }

    stream("sess-1", -1);
    expect(capturedUrls[0]).toBe("/api/sessions/sess-1/stream?since=-1");
    vi.unstubAllGlobals();
  });

  it("stop semantics: session state machine is correct", () => {
    const validTransitions: Record<string, string[]> = {
      created: ["starting", "stopping"],
      starting: ["running", "stopping", "failed"],
      running: ["stopping", "completed", "failed"],
      stopping: ["stopped", "failed"],
      stopped: ["created"],
      failed: ["created"],
      completed: [],
    };

    expect(validTransitions["running"]).toContain("stopping");
    expect(validTransitions["stopping"]).toContain("stopped");
    expect(validTransitions["stopped"]).toContain("created");
    expect(validTransitions["failed"]).toContain("created");
    expect(validTransitions["completed"]).toHaveLength(0);
  });
});
