import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rmdir, writeFile, symlink, mkdir } from "fs/promises";
import path from "path";
import os from "os";
import { validateWorkingDirectory, WorkdirValidationError } from "../services/workdirPolicyService.js";

let tmpDir: string;
let outsideDir: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "workdir-test-"));
  outsideDir = await mkdtemp(path.join(os.tmpdir(), "workdir-outside-test-"));
  // Create a subdirectory
  await mkdir(path.join(tmpDir, "project"));
  // Create a file (not a directory)
  await writeFile(path.join(tmpDir, "file.txt"), "hello");
  // Create a symlink inside allowed roots
  await symlink(path.join(tmpDir, "project"), path.join(tmpDir, "project-link"));
  // Create a symlink outside allowed roots pointing inside allowed roots
  await symlink(path.join(tmpDir, "project"), path.join(outsideDir, "project-inside-link"));
});

afterAll(async () => {
  // Clean up
  const { rm } = await import("fs/promises");
  await rm(tmpDir, { recursive: true, force: true });
  await rm(outsideDir, { recursive: true, force: true });
});

const configWith = (roots: string[]) => ({
  allowedRoots: roots,
  runtimeMode: "local" as const,
});

describe("validateWorkingDirectory", () => {
  it("accepts a valid directory under allowed roots", async () => {
    const policy = await validateWorkingDirectory(
      path.join(tmpDir, "project"),
      [],
      configWith([tmpDir])
    );
    expect(policy.inputPath).toBe(path.join(tmpDir, "project"));
    expect(policy.resolvedPath).toContain("project");
    expect(policy.runtimeMode).toBe("local");
    expect(policy.exposedSurfaces).toEqual([]);
  });

  it("rejects a non-existent path with WORKDIR_NOT_FOUND", async () => {
    await expect(
      validateWorkingDirectory(path.join(tmpDir, "nonexistent"), [], configWith([tmpDir]))
    ).rejects.toThrow(WorkdirValidationError);

    try {
      await validateWorkingDirectory(path.join(tmpDir, "nonexistent"), [], configWith([tmpDir]));
    } catch (err) {
      expect((err as WorkdirValidationError).code).toBe("WORKDIR_NOT_FOUND");
    }
  });

  it("rejects a file path with WORKDIR_NOT_DIRECTORY", async () => {
    try {
      await validateWorkingDirectory(path.join(tmpDir, "file.txt"), [], configWith([tmpDir]));
    } catch (err) {
      expect((err as WorkdirValidationError).code).toBe("WORKDIR_NOT_DIRECTORY");
    }
  });

  it("rejects a path outside allowed roots with WORKDIR_NOT_ALLOWED", async () => {
    try {
      await validateWorkingDirectory(tmpDir, [], configWith(["/some/other/root"]));
    } catch (err) {
      expect((err as WorkdirValidationError).code).toBe("WORKDIR_NOT_ALLOWED");
    }
  });

  it("resolves symlinks and validates the target", async () => {
    const policy = await validateWorkingDirectory(
      path.join(tmpDir, "project-link"),
      [],
      configWith([tmpDir])
    );
    // resolvedPath should be the real path (not the symlink)
    expect(policy.resolvedPath).toContain("project");
    expect(policy.resolvedPath).not.toContain("project-link");
  });

  it("rejects symlink input path when source is outside allowed roots", async () => {
    await expect(
      validateWorkingDirectory(
        path.join(outsideDir, "project-inside-link"),
        [],
        configWith([tmpDir])
      )
    ).rejects.toMatchObject({
      code: "WORKDIR_NOT_ALLOWED",
    });
  });

  it("rejects exposed surfaces outside allowed roots", async () => {
    try {
      await validateWorkingDirectory(
        path.join(tmpDir, "project"),
        [{ hostPath: "/etc", mode: "read_only" }],
        configWith([tmpDir])
      );
    } catch (err) {
      expect((err as WorkdirValidationError).code).toBe("EXPOSED_SURFACE_NOT_ALLOWED");
    }
  });

  it("accepts exposed surfaces within allowed roots", async () => {
    const policy = await validateWorkingDirectory(
      path.join(tmpDir, "project"),
      [{ hostPath: path.join(tmpDir, "project"), mode: "read_only", label: "test" }],
      configWith([tmpDir])
    );
    expect(policy.exposedSurfaces).toHaveLength(1);
    expect(policy.exposedSurfaces[0].label).toBe("test");
  });
});
