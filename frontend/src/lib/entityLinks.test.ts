import { describe, expect, it } from "vitest";
import { entityPath, notificationPath } from "./entityLinks";

describe("entity links", () => {
  it("builds stable task, project, and idea detail routes", () => {
    expect(entityPath("task", "task_1")).toBe("/app/tasks/task_1");
    expect(entityPath("project", "project_1")).toBe("/app/projects/project_1");
    expect(entityPath("idea", "idea_1")).toBe("/app/ideas/idea_1");
  });

  it("routes chat and approval notifications to their control surfaces", () => {
    const base = { severity: "info", actor: "Gordon", dedupeKey: "x", createdAt: new Date().toISOString() } as const;
    expect(notificationPath({ ...base, id: "1", type: "gordon_chat_reply", title: "Reply" })).toBe("/app/agent#chat");
    expect(notificationPath({ ...base, id: "2", type: "approval_requested", title: "Approval" })).toBe("/app/agent#approvals");
  });
});
