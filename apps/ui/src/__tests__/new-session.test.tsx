import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NewSessionPage } from "../pages/NewSessionPage.js";

const mockCreate = vi.fn();
vi.mock("../api.js", () => ({
  api: {
    sessions: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <NewSessionPage />
    </MemoryRouter>
  );
}

describe("NewSessionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates session with goal only (default workspace)", async () => {
    mockCreate.mockResolvedValue({ session: { id: "sess-1" } });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/README/), { target: { value: "test goal" } });
    fireEvent.click(screen.getByText("Create Session"));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });
    const body = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(body.goal).toBe("test goal");
    expect(body.githubRepoUrl).toBeUndefined();
    expect(body.workingDirectory).toBeUndefined();
  });

  it("sends optional workingDirectory when set", async () => {
    mockCreate.mockResolvedValue({ session: { id: "sess-1" } });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/README/), { target: { value: "goal" } });
    fireEvent.change(screen.getByPlaceholderText(/Leave empty/), { target: { value: "/tmp/proj" } });
    fireEvent.click(screen.getByText("Create Session"));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          goal: "goal",
          workingDirectory: "/tmp/proj",
        })
      );
    });
    expect((mockCreate.mock.calls[0][0] as Record<string, unknown>).githubRepoUrl).toBeUndefined();
  });

  it("disables create until goal is non-empty", () => {
    renderPage();
    expect((screen.getByText("Create Session") as HTMLButtonElement).disabled).toBe(true);
  });
});
