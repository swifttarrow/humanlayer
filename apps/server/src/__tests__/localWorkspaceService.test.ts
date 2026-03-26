import { describe, it, expect, afterEach } from "vitest";
import { rm, realpath } from "fs/promises";
import path from "path";
import os from "os";
import { getDefaultLocalWorkdirRaw, prepareDefaultLocalWorkspace } from "../services/localWorkspaceService.js";

describe("localWorkspaceService", () => {
  const orig = { ...process.env };

  afterEach(() => {
    process.env = { ...orig };
  });

  it("getDefaultLocalWorkdirRaw defaults to /workspace", () => {
    delete process.env.SESSION_DEFAULT_WORKDIR;
    expect(getDefaultLocalWorkdirRaw()).toBe("/workspace");
  });

  it("getDefaultLocalWorkdirRaw respects SESSION_DEFAULT_WORKDIR", () => {
    process.env.SESSION_DEFAULT_WORKDIR = "/custom/ws";
    expect(getDefaultLocalWorkdirRaw()).toBe("/custom/ws");
  });

  it("prepareDefaultLocalWorkspace creates directory and returns docker policy", async () => {
    const tmp = path.join(os.tmpdir(), `hl-local-ws-${Date.now()}`);
    process.env.SESSION_DEFAULT_WORKDIR = tmp;
    try {
      const result = await prepareDefaultLocalWorkspace();
      expect(result.workdirPolicy.resolvedPath).toBe(await realpath(tmp));
      expect(result.workdirPolicy.runtimeMode).toBe("docker");
      expect(result.workdirDetails.source).toBe("local_bind_mount");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
