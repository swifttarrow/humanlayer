import { describe, it, expect } from "vitest";
import { formatJsonlEvent, parseJsonlLine, isCompatibleVersion, type JsonlEvent } from "../jsonl.js";

const sampleEvent: JsonlEvent = {
  version: "1",
  timestamp: "2025-01-01T00:00:00.000Z",
  sessionId: "sess-123",
  type: "event",
  data: { eventType: "session.started", payload: { goal: "test" } },
};

describe("jsonl", () => {
  describe("formatJsonlEvent", () => {
    it("formats event as single JSON line with trailing newline", () => {
      const line = formatJsonlEvent(sampleEvent);
      expect(line.endsWith("\n")).toBe(true);
      expect(line.split("\n").length).toBe(2); // content + empty after newline
      const parsed = JSON.parse(line.trim());
      expect(parsed.version).toBe("1");
      expect(parsed.sessionId).toBe("sess-123");
    });
  });

  describe("parseJsonlLine", () => {
    it("parses valid JSONL line", () => {
      const line = formatJsonlEvent(sampleEvent);
      const parsed = parseJsonlLine(line);
      expect(parsed).not.toBeNull();
      expect(parsed!.version).toBe("1");
      expect(parsed!.sessionId).toBe("sess-123");
    });

    it("returns null for empty line", () => {
      expect(parseJsonlLine("")).toBeNull();
      expect(parseJsonlLine("  ")).toBeNull();
    });

    it("returns null for invalid JSON", () => {
      expect(parseJsonlLine("{invalid")).toBeNull();
    });

    it("returns null for JSON missing required fields", () => {
      expect(parseJsonlLine('{"foo": "bar"}')).toBeNull();
    });
  });

  describe("isCompatibleVersion", () => {
    it("returns true for compatible version", () => {
      expect(isCompatibleVersion(sampleEvent)).toBe(true);
    });

    it("returns false for future version", () => {
      const futureEvent = { ...sampleEvent, version: "999" };
      expect(isCompatibleVersion(futureEvent, "1")).toBe(false);
    });
  });
});
