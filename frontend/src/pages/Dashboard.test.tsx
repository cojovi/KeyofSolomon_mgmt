import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "./Dashboard";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: { get: vi.fn() },
  connectSSE: vi.fn(() => () => {}),
}));

const task = { id: "task_click", title: "Clickable task", source: "user", status: "in_progress", priority: "high", tags: [], agentCandidate: true, createdAt: "2026-07-15T12:00:00Z", updatedAt: "2026-07-15T12:00:00Z" };

describe("Dashboard navigation", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === "/settings") return { dashboardRefreshSeconds: "30", reducedMotion: "true" } as any;
      if (path === "/ai/summaries") return [] as any;
      if (path === "/approvals/pending") return [] as any;
      return {
        generatedAt: "2026-07-15T12:00:00Z",
        summary: { activeProjects: 1, openTasks: 1, blockedItems: 0, ideas: 1, dueToday: 0, overdue: 0, completedToday: 0 },
        ticker: [{ type: "agent", label: "AGENT", text: "Clickable task", targetType: "task", targetId: task.id }],
        projects: [{ id: "project_click", title: "Clickable project", status: "active", progressPercent: 20, tags: [], createdAt: task.createdAt, updatedAt: task.updatedAt }],
        tasks: { inProgress: [task], todo: [], waiting: [], blocked: [], dueSoon: [], dueToday: [], completedToday: [] },
        ideas: [{ id: "idea_click", title: "Clickable idea", status: "captured", tags: [], createdAt: task.createdAt, updatedAt: task.updatedAt }],
        recentNotes: [{ id: "note_1", parentType: "task", parentId: task.id, body: "Clickable activity", type: "progress", createdBy: "agent", createdAt: task.createdAt }],
        agentActions: [{ id: "act_1", agentName: "Gordon", actionType: "update", targetType: "task", targetId: task.id, summary: "Updated clickable task", createdAt: task.createdAt }],
        upcomingDeadlines: [{ id: task.id, title: "Clickable deadline", dueDate: "2026-07-16", status: "in_progress", kind: "task" }],
      } as any;
    });
  });

  it("links entity-backed board rows to stable detail routes", async () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByText("Clickable task").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Clickable task").some((node) => node.closest("a")?.getAttribute("href") === "/app/tasks/task_click")).toBe(true);
    expect(screen.getByText("Clickable project").closest("a")).toHaveAttribute("href", "/app/projects/project_click");
    expect(screen.getByText("Clickable idea").closest("a")).toHaveAttribute("href", "/app/ideas/idea_click");
    expect(screen.getByText("Clickable deadline").closest("a")).toHaveAttribute("href", "/app/tasks/task_click");
  });
});
