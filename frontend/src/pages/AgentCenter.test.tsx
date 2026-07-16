import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AgentCenter } from "./AgentCenter";
import { api, apiStream } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  apiStream: vi.fn(),
  connectSSE: vi.fn(() => () => {}),
}));

describe("Chat with Gordon", () => {
  it("streams a persisted Gordon reply into the transcript", async () => {
    let chatHistory: any[] = [];
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === "/integrations/openclaw/status") return {
        enabled: true, configured: true, destination: "mini.tailnet", queue: { queued: 0, delivering: 0, delivered: 1, failed: 0 }, latest: null,
        chat: { enabled: true, configured: true, destination: "mini.tailnet", busy: false, latest: null },
      } as any;
      if (path.startsWith("/integrations/openclaw/chat/messages")) return chatHistory as any;
      return [] as any;
    });
    vi.mocked(apiStream).mockImplementation(async (_path, body: any, onEvent) => {
      const user = { id: "chat_user", conversationId: "gordon-main", role: "user", content: body.message, status: "complete", createdAt: "2026-07-15T12:00:00Z", updatedAt: "2026-07-15T12:00:00Z" };
      const assistant = { id: "chat_assistant", conversationId: "gordon-main", role: "assistant", content: "", status: "streaming", replyToId: user.id, createdAt: "2026-07-15T12:00:01Z", updatedAt: "2026-07-15T12:00:01Z" };
      onEvent({ type: "message", data: { user, assistant } });
      onEvent({ type: "delta", data: { id: assistant.id, delta: "Streaming reply" } });
      const completed = { ...assistant, content: "Streaming reply", status: "complete" };
      chatHistory = [user, completed];
      onEvent({ type: "done", data: { message: completed } });
    });
    const user = userEvent.setup();
    render(<MemoryRouter><AgentCenter /></MemoryRouter>);
    const input = await screen.findByPlaceholderText(/Message Gordon/);
    await user.type(input, "Hello Gordon");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Streaming reply")).toBeInTheDocument();
    expect(apiStream).toHaveBeenCalledWith("/integrations/openclaw/chat/stream", { message: "Hello Gordon" }, expect.any(Function));
  });
});
