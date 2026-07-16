import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Tasks } from "./Tasks";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

describe("Task deep links", () => {
  it("opens task detail directly from a stable route", async () => {
    const task = { id: "task_deep", title: "Deep-linked task", source: "user", status: "todo", priority: "medium", tags: [], agentCandidate: false, createdAt: "2026-07-15T12:00:00Z", updatedAt: "2026-07-15T12:00:00Z", subtasks: [], notes: [], attachments: [], parentTask: null };
    vi.mocked(api.get).mockImplementation(async (path: string) => path.startsWith("/tasks?") ? [task] as any : task as any);
    render(<MemoryRouter initialEntries={["/app/tasks/task_deep"]}><Routes><Route path="/app/tasks/:taskId" element={<Tasks />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Task Details" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Deep-linked task" })).toBeInTheDocument());
  });
});
