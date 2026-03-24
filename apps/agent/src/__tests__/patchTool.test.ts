import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { runPatch } from "../tools/patchTool.js";

describe("runPatch", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("creates a missing file when patch is a create-file diff", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "patchtool-"));
    tempDirs.push(dir);

    const target = path.join(dir, "CardCarousel.jsx");
    const patch = [
      "@@ -0,0 +1,3 @@",
      "+import React from 'react';",
      "+",
      "+export default function CardCarousel() { return null; }",
    ].join("\n");

    await runPatch(target, patch);

    const content = await readFile(target, "utf-8");
    expect(content).toContain("CardCarousel");
  });

  it("still fails on missing file when patch is not a create-file diff", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "patchtool-"));
    tempDirs.push(dir);

    const target = path.join(dir, "missing.ts");
    const patch = ["@@ -1,1 +1,1 @@", "-old", "+new"].join("\n");

    await expect(runPatch(target, patch)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("patches an existing file without changing prior behavior", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "patchtool-"));
    tempDirs.push(dir);

    const target = path.join(dir, "example.ts");
    await writeFile(target, "one\ntwo\nthree\n", "utf-8");
    const patch = ["@@ -2,1 +2,1 @@", "-two", "+TWO"].join("\n");

    await runPatch(target, patch);

    const content = await readFile(target, "utf-8");
    expect(content).toBe("one\nTWO\nthree\n");
  });
});
