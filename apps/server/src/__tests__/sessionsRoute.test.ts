import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import { WorkdirValidationError } from "../services/workdirPolicyService.js";
import { GithubRepoValidationError } from "../services/githubWorkspaceService.js";

const mockCreateSession = vi.hoisted(() => vi.fn());
const mockResolveSessionSelections = vi.hoisted(() => vi.fn());

vi.mock("../services/sessionService.js", async () => {
  const actual = await vi.importActual<typeof import("../services/sessionService.js")>(
    "../services/sessionService.js"
  );
  return {
    ...actual,
    createSession: mockCreateSession,
    listSessions: vi.fn(),
    getSession: vi.fn(),
    stopSession: vi.fn(),
    retrySession: vi.fn(),
  };
});

vi.mock("../services/policySelectionService.js", () => ({
  resolveSessionSelections: mockResolveSessionSelections,
}));

import { sessionsRouter } from "../routes/sessions.js";

let activeServer: ReturnType<express.Express["listen"]> | null = null;

function allowedSelectionResult() {
  return {
    runtimeMode: { outcome: "allowed", value: "docker", decidedBy: "system" },
    agentType: { outcome: "allowed", value: "default", decidedBy: "system" },
    provider: { outcome: "allowed", value: "openai", decidedBy: "system" },
    model: { outcome: "allowed", value: "gpt-4.1-mini", decidedBy: "system" },
    overall: "allowed",
    denials: [],
  };
}

const defaultGithubBody = {
  goal: "test",
  githubRepoUrl: "https://github.com/octocat/Hello-World",
};

const minimalCreateBody = { goal: "test" };

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
  it("returns 201 when only goal is provided (default local workspace)", async () => {
    mockResolveSessionSelections.mockReturnValue(allowedSelectionResult());
    mockCreateSession.mockResolvedValueOnce({
      id: "00000000-0000-0000-0000-000000000001",
      status: "created",
      goal: "test",
      agentType: "default",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const result = await postSession(minimalCreateBody);
    expect(result.status).toBe(201);
  });

  it("returns 422 with code for GitHub validation failures", async () => {
    mockResolveSessionSelections.mockReturnValue(allowedSelectionResult());
    mockCreateSession.mockRejectedValueOnce(
      new GithubRepoValidationError("GITHUB_REPO_NOT_PUBLIC", "not public")
    );

    const result = await postSession(defaultGithubBody);
    expect(result.status).toBe(422);
    expect(result.text).toContain("GITHUB_REPO_NOT_PUBLIC");
  });

  it("returns 422 with code/path for workdir validation failures", async () => {
    mockResolveSessionSelections.mockReturnValue(allowedSelectionResult());
    const err = new WorkdirValidationError(
      "WORKDIR_NOT_FOUND",
      "Working directory not found",
      "/bad/path"
    );
    mockCreateSession.mockRejectedValueOnce(err);

    const result = await postSession({
      goal: "test",
      workingDirectory: "/bad/path",
      metadata: { parentSessionId: "550e8400-e29b-41d4-a716-446655440000" },
    });
    expect(result.status).toBe(422);
    expect(result.text).toContain("WORKDIR_NOT_FOUND");
    expect(result.text).toContain("/bad/path");
  });

  it("returns 500 for non-policy errors even when they include a code property", async () => {
    mockResolveSessionSelections.mockReturnValue(allowedSelectionResult());
    const dbErr = Object.assign(new Error("Prisma unique violation"), { code: "P2002" });
    mockCreateSession.mockRejectedValueOnce(dbErr);

    const result = await postSession(minimalCreateBody);
    expect(result.status).toBe(500);
  });

  it("returns 422 with SELECTION_DENIED for policy denials", async () => {
    mockResolveSessionSelections.mockReturnValue({
      ...allowedSelectionResult(),
      overall: "denied",
      denials: [
        {
          field: "agentType",
          reason: "AGENT_TYPE_NOT_REGISTERED",
          message: "Unknown agent type",
        },
      ],
    });

    const result = await postSession({
      ...minimalCreateBody,
      agentType: "bogus_type",
    });
    expect(result.status).toBe(422);
    expect(result.text).toContain("SELECTION_DENIED");
    expect(result.text).toContain("AGENT_TYPE_NOT_REGISTERED");
  });
});
