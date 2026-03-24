import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NewSessionPage } from "../pages/NewSessionPage.js";

// Mock the api module
const mockCreate = vi.fn();
vi.mock("../api.js", () => ({
  api: {
    sessions: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

// Mock useNavigate
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

  it("renders the working directory input", () => {
    renderPage();
    expect(screen.getByPlaceholderText(/absolute path/i)).toBeDefined();
  });

  it("sends workingDirectory in create request", async () => {
    mockCreate.mockResolvedValue({ session: { id: "sess-1" } });
    renderPage();

    const goalInput = screen.getByPlaceholderText(/Refactor/);
    const workdirInput = screen.getByPlaceholderText(/absolute path/i);
    const createButton = screen.getByText("Create Session");

    fireEvent.change(goalInput, { target: { value: "test goal" } });
    fireEvent.change(workdirInput, { target: { value: "/tmp/project" } });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          goal: "test goal",
          workingDirectory: "/tmp/project",
        })
      );
    });
  });

  it("omits workingDirectory when empty", async () => {
    mockCreate.mockResolvedValue({ session: { id: "sess-1" } });
    renderPage();

    const goalInput = screen.getByPlaceholderText(/Refactor/);
    const createButton = screen.getByText("Create Session");

    fireEvent.change(goalInput, { target: { value: "test goal" } });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          goal: "test goal",
          workingDirectory: undefined,
        })
      );
    });
  });

  it("displays error and preserves form values on failure", async () => {
    mockCreate.mockRejectedValue(new Error('{"error":"Working directory not found","code":"WORKDIR_NOT_FOUND"}'));
    renderPage();

    const goalInput = screen.getByPlaceholderText(/Refactor/);
    const workdirInput = screen.getByPlaceholderText(/absolute path/i);
    const createButton = screen.getByText("Create Session");

    fireEvent.change(goalInput, { target: { value: "test goal" } });
    fireEvent.change(workdirInput, { target: { value: "/nonexistent" } });
    fireEvent.click(createButton);

    await waitFor(() => {
      // Error is displayed
      expect(screen.getByText(/WORKDIR_NOT_FOUND/)).toBeDefined();
    });

    // Form values are preserved
    expect((goalInput as HTMLTextAreaElement).value).toBe("test goal");
    expect((workdirInput as HTMLInputElement).value).toBe("/nonexistent");
  });
});
