import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import { WorkdirValidationError } from "../services/workdirPolicyService.js";

const mockCreateSession = vi.hoisted(() => vi.fn());

vi.mock("../services/sessionService.js", () => ({
  createSession: mockCreateSession,
  listSessions: vi.fn(),
  getSession: vi.fn(),
  stopSession: vi.fn(),
  retrySession: vi.fn(),
}));

import { sessionsRouter } from "../routes/sessions.js";

let activeServer: ReturnType<express.Express["listen"]> | null = null;

afterEach(async () => {
  if (activeServer) {
    await new Promise<void>((resolve, reject) => {
      activeServer?.close((err) => (err ? reject(err) : resolve()));
    });
    activeServer = null;
  }
  vi.clearAllMocks();
});

async function postSession(body: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use("/sessions", sessionsRouter);

  activeServer = app.listen(0);
  await new Promise<void>((resolve) => activeServer?.once("listening", () => resolve()));
  const { port } = activeServer.address() as AddressInfo;

  const res = await fetch(`http://127.0.0.1:${port}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text };
}

describe("sessionsRouter POST /sessions", () => {
  it("returns 422 with code/path for workdir validation failures", async () => {
    const err = new WorkdirValidationError(
      "WORKDIR_NOT_FOUND",
      "Working directory not found",
      "/bad/path"
    );
    mockCreateSession.mockRejectedValueOnce(err);

    const result = await postSession({ goal: "test", workingDirectory: "/bad/path" });
    expect(result.status).toBe(422);
    expect(result.text).toContain("WORKDIR_NOT_FOUND");
    expect(result.text).toContain("/bad/path");
  });

  it("returns 500 for non-policy errors even when they include a code property", async () => {
    const dbErr = Object.assign(new Error("Prisma unique violation"), { code: "P2002" });
    mockCreateSession.mockRejectedValueOnce(dbErr);

    const result = await postSession({ goal: "test" });
    expect(result.status).toBe(500);
  });
});
