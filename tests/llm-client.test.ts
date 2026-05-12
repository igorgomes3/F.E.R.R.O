import { beforeEach, describe, expect, it, vi } from "vitest";

const openAiCalls: Array<{ apiKey: string; baseURL: string }> = [];
const chatBodies: Array<Record<string, unknown>> = [];
const responseBodies: Array<Record<string, unknown>> = [];

vi.mock("openai", () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn(async (body: Record<string, unknown>) => {
          chatBodies.push(body);
          return {
            choices: [{ message: { content: " Chat answer " } }],
            usage: { total_tokens: 12 },
          };
        }),
      },
    };

    responses = {
      create: vi.fn(async (body: Record<string, unknown>) => {
        responseBodies.push(body);
        return {
          output_text: " Response answer ",
          usage: { total_tokens: 8 },
        };
      }),
    };

    constructor(opts: { apiKey: string; baseURL: string }) {
      openAiCalls.push(opts);
    }
  }

  return { default: MockOpenAI };
});

describe("llm client", () => {
  beforeEach(() => {
    vi.resetModules();
    openAiCalls.length = 0;
    chatBodies.length = 0;
    responseBodies.length = 0;
  });

  it("normalizes OpenAI-compatible endpoints", async () => {
    const { normalizeOpenAIBaseUrl } = await import("../src/core/llm-client.js");

    expect(normalizeOpenAIBaseUrl("https://api.example/v1/chat/completions/")).toBe("https://api.example/v1");
    expect(normalizeOpenAIBaseUrl("https://api.example/v1/responses/")).toBe("https://api.example/v1");
    expect(normalizeOpenAIBaseUrl("https://api.example/v1/")).toBe("https://api.example/v1");
  });

  it("uses Chat Completions and returns message content with usage", async () => {
    const { createTextResponse } = await import("../src/core/llm-client.js");

    const result = await createTextResponse({
      apiKey: "test-key",
      endpoint: "https://api.example/v1/chat/completions",
      model: "gpt-test",
      protocol: "chat_completions",
      messages: [{ role: "user", content: "hello" }],
      temperature: 0.2,
      maxTokens: 123,
    });

    expect(openAiCalls).toEqual([{ apiKey: "test-key", baseURL: "https://api.example/v1" }]);
    expect(chatBodies).toEqual([
      {
        model: "gpt-test",
        messages: [{ role: "user", content: "hello" }],
        temperature: 0.2,
        max_tokens: 123,
      },
    ]);
    expect(responseBodies).toEqual([]);
    expect(result).toEqual({ message: " Chat answer ", usage: { total_tokens: 12 } });
  });

  it("uses Responses with system instructions and returns output_text with usage", async () => {
    const { createTextResponse } = await import("../src/core/llm-client.js");

    const result = await createTextResponse({
      apiKey: "test-key",
      endpoint: "https://api.example/v1/responses",
      model: "gpt-test",
      protocol: "responses",
      messages: [
        { role: "system", content: "Follow rules" },
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ],
      temperature: 0.4,
      maxTokens: 456,
    });

    expect(openAiCalls).toEqual([{ apiKey: "test-key", baseURL: "https://api.example/v1" }]);
    expect(responseBodies).toEqual([
      {
        model: "gpt-test",
        instructions: "Follow rules",
        input: [
          { role: "user", content: "hello" },
          { role: "assistant", content: "hi" },
        ],
        temperature: 0.4,
        max_output_tokens: 456,
      },
    ]);
    expect(chatBodies).toEqual([]);
    expect(result).toEqual({ message: " Response answer ", usage: { total_tokens: 8 } });
  });

  it("disables GLM thinking only for Chat Completions", async () => {
    const { createTextResponse } = await import("../src/core/llm-client.js");

    await createTextResponse({
      apiKey: "test-key",
      endpoint: "https://api.example/v1/chat/completions",
      model: "glm-5",
      protocol: "chat_completions",
      messages: [{ role: "user", content: "hello" }],
    });

    await createTextResponse({
      apiKey: "test-key",
      endpoint: "https://api.example/v1/responses",
      model: "glm-5",
      protocol: "responses",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(chatBodies[0]).toMatchObject({ thinking: { type: "disabled" } });
    expect(responseBodies[0]).not.toHaveProperty("thinking");
  });
});
