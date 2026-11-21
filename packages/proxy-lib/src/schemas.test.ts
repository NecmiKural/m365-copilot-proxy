import { describe, it, expect } from "vitest";
import { ChatMessage, ChatCompletionRequest } from "./schemas";

describe("ChatMessage role normalization", () => {
  it("normalizes the OpenAI `developer` role to `system`", () => {
    const msg = ChatMessage.parse({ role: "developer", content: "you are a bot" });
    expect(msg.role).toBe("system");
  });

  it("passes the four canonical roles through unchanged", () => {
    for (const role of ["system", "user", "assistant", "tool"] as const) {
      expect(ChatMessage.parse({ role, content: "hi" }).role).toBe(role);
    }
  });

  it("rejects an unknown role", () => {
    expect(() => ChatMessage.parse({ role: "wizard", content: "hi" })).toThrow();
  });

  it("accepts a request whose first message uses `developer` (the Hermes case)", () => {
    const req = ChatCompletionRequest.parse({
      model: "gpt-5.5-think-deeper",
      messages: [
        { role: "developer", content: "system prompt" },
        { role: "user", content: "hi" },
      ],
    });
    expect(req.messages[0].role).toBe("system");
  });
});

describe("parallel_tool_calls capability", () => {
  it("preserves explicit true and leaves omission undefined", () => {
    const base = { model: "claude-sonnet", messages: [{ role: "user", content: "hi" }] };
    expect(ChatCompletionRequest.parse({ ...base, parallel_tool_calls: true }).parallel_tool_calls).toBe(true);
    expect(ChatCompletionRequest.parse(base).parallel_tool_calls).toBeUndefined();
  });
});
