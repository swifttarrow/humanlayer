import { describe, it, expect } from "vitest";
import { EXIT_SUCCESS, EXIT_USAGE, EXIT_FAILURE, EXIT_POLICY_DENIED, EXIT_TIMEOUT, EXIT_RUNTIME_ERROR } from "../exitCodes.js";

describe("CLI exit codes", () => {
  it("defines deterministic exit codes", () => {
    expect(EXIT_SUCCESS).toBe(0);
    expect(EXIT_FAILURE).toBe(1);
    expect(EXIT_POLICY_DENIED).toBe(2);
    expect(EXIT_TIMEOUT).toBe(3);
    expect(EXIT_RUNTIME_ERROR).toBe(4);
    expect(EXIT_USAGE).toBe(64);
  });
});
