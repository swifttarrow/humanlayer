import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, symlink, mkdir } from "fs/promises";
import path from "path";
import os from "os";
import { validateWorkingDirectory, WorkdirValidationError } from "../services/workdirPolicyService.js";

let tmpDir: string;
let outsideDir: string;
let homeTmpDir: string;

const localConfig = { runtimeMode: "local" as const };

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "workdir-test-"));
  outsideDir = await mkdtemp(path.join(os.tmpdir(), "workdir-outside-test-"));
  homeTmpDir = await mkdtemp(path.join(os.homedir(), "workdir-home-test-"));
  await mkdir(path.join(tmpDir, "project"));
  await mkdir(path.join(homeTmpDir, "project"));
  await writeFile(path.join(tmpDir, "file.txt"), "hello");
  await symlink(path.join(tmpDir, "project"), path.join(tmpDir, "project-link"));
  await symlink(path.join(tmpDir, "project"), path.join(outsideDir, "project-inside-link"));
});

afterAll(async () => {
  const { rm } = await import("fs/promises");
  await rm(tmpDir, { recursive: true, force: true });
  await rm(outsideDir, { recursive: true, force: true });
  await rm(homeTmpDir, { recursive: true, force: true });
});

describe("validateWorkingDirectory", () => {
  it("accepts a valid existing directory", async () => {
    const policy = await validateWorkingDirectory(path.join(tmpDir, "project"), localConfig);
    expect(policy.inputPath).toBe(path.join(tmpDir, "project"));
    expect(policy.resolvedPath).toContain("project");
    expect(policy.runtimeMode).toBe("local");
  });

  it("rejects a non-existent path with WORKDIR_NOT_FOUND", async () => {
    await expect(
      validateWorkingDirectory(path.join(tmpDir, "nonexistent"), localConfig)
    ).rejects.toThrow(WorkdirValidationError);

    try {
      await validateWorkingDirectory(path.join(tmpDir, "nonexistent"), localConfig);
    } catch (err) {
      expect((err as WorkdirValidationError).code).toBe("WORKDIR_NOT_FOUND");
    }
  });

  it("rejects a file path with WORKDIR_NOT_DIRECTORY", async () => {
    try {
      await validateWorkingDirectory(path.join(tmpDir, "file.txt"), localConfig);
    } catch (err) {
      expect((err as WorkdirValidationError).code).toBe("WORKDIR_NOT_DIRECTORY");
    }
  });

  it("resolves symlinks and validates the target", async () => {
    const policy = await validateWorkingDirectory(
      path.join(tmpDir, "project-link"),
      localConfig
    );
    expect(policy.resolvedPath).toContain("project");
    expect(policy.resolvedPath).not.toContain("project-link");
  });

  it("accepts symlink when the link lives outside the target tree but resolves to a valid directory", async () => {
    const policy = await validateWorkingDirectory(
      path.join(outsideDir, "project-inside-link"),
      localConfig
    );
    expect(policy.resolvedPath).toContain("project");
    expect(policy.resolvedPath).not.toContain("project-inside-link");
  });

  it("accepts ~-prefixed working directory paths", async () => {
    const home = os.homedir();
    const projectPath = path.join(homeTmpDir, "project");
    const relFromHome = path.relative(home, projectPath);
    const tildePath = relFromHome ? `~/${relFromHome}` : "~";

    const policy = await validateWorkingDirectory(tildePath, localConfig);
    expect(policy.inputPath).toBe(tildePath);
    expect(policy.resolvedPath).toContain("workdir-home-test-");
  });
});
