import { beforeEach, describe, expect, it, vi } from "vitest";

let storeData: Record<string, unknown> = {};
const openAiCalls: Array<{ apiKey: string; baseURL: string }> = [];
const chatCalls: unknown[] = [];
const responseCalls: unknown[] = [];
const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>();
let mockResponseText = "Troque cedo.";

vi.mock("dotenv/config", () => ({}));
vi.mock("axios", () => ({
  default: { create: () => ({ get: async () => ({ data: {} }) }) },
}));
vi.mock("say", () => ({
  default: { speak: () => {} },
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler);
    }),
  },
  dialog: {},
  app: {},
}));

vi.mock("electron-store", () => {
  return {
    default: class MockStore {
      constructor(opts: { defaults?: Record<string, unknown> }) {
        storeData = opts.defaults ? JSON.parse(JSON.stringify(opts.defaults)) : {};
      }

      get store() {
        return JSON.parse(JSON.stringify(storeData));
      }

      get(key: string) {
        const keys = key.split(".");
        let obj: unknown = storeData;
        for (const k of keys) {
          obj = (obj as Record<string, unknown>)?.[k];
        }
        return obj;
      }

      set(key: string, value: unknown) {
        const keys = key.split(".");
        let obj: Record<string, unknown> = storeData;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!obj[keys[i]] || typeof obj[keys[i]] !== "object") obj[keys[i]] = {};
          obj = obj[keys[i]] as Record<string, unknown>;
        }
        obj[keys[keys.length - 1]] = value;
      }

      clear() {
        storeData = {};
      }
    },
  };
});

vi.mock("openai", () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn(async (body: unknown) => {
          chatCalls.push(body);
          return {
          choices: [{ message: { content: mockResponseText } }],
          usage: null,
          };
        }),
      },
    };

    responses = {
      create: vi.fn(async (body: unknown) => {
        responseCalls.push(body);
        return {
          output_text: mockResponseText,
          usage: null,
        };
      }),
    };

    constructor(opts: { apiKey: string; baseURL: string }) {
      openAiCalls.push(opts);
    }
  }

  return { default: MockOpenAI };
});

describe("LLM provider switching", () => {
  beforeEach(() => {
    vi.resetModules();
    storeData = {};
    openAiCalls.length = 0;
    chatCalls.length = 0;
    responseCalls.length = 0;
    ipcHandlers.clear();
    mockResponseText = "Troque cedo.";
    delete process.env.ZAI_API_KEY;
    delete process.env.ZAI_ENDPOINT;
    delete process.env.ZAI_MODEL;
    delete process.env.LLM_PROTOCOL;
  });

  it("syncs engine llmStatus after enabling Z.AI in config", async () => {
    const configService = await import("../src/main/services/config-service.js");
    configService.initConfigStore();

    const { engine } = await import("../src/main/services/engine.js");
    expect(engine.engineState.llmStatus).toBe("disabled");

    configService.setPath("llm.activeProvider", "zai");
    configService.setPath("llm.providers.zai.apiKey", "test-key");
    configService.setPath("llm.providers.zai.model", "glm-5-turbo");
    engine.syncConfig();

    expect(engine.engineState.llmStatus).toBe("idle");
  });

  it("creates a fresh LLM client from the current runtime settings", async () => {
    process.env.ZAI_API_KEY = "first-key";
    process.env.ZAI_ENDPOINT = "https://first.example/v1/chat/completions";
    process.env.ZAI_MODEL = "glm-5";

    const configMod = await import("../src/core/config.js");
    const coachMod = await import("../src/core/coach.js");
    const snapshot = {
      activePlayerChampion: "Ahri",
      enemyPlayers: [{ championName: "Lux" }],
    };

    configMod.settings.zaiApiKey = "first-key";
    configMod.settings.zaiEndpoint = "https://first.example/v1/chat/completions";
    configMod.settings.zaiModel = "glm-5";
    await coachMod.getMatchupTip(snapshot);

    configMod.settings.zaiApiKey = "second-key";
    configMod.settings.zaiEndpoint = "https://second.example/custom/chat/completions";
    configMod.settings.zaiModel = "glm-5-turbo";
    await coachMod.getMatchupTip(snapshot);

    expect(openAiCalls).toEqual([
      { apiKey: "first-key", baseURL: "https://first.example/v1" },
      { apiKey: "second-key", baseURL: "https://second.example/custom" },
    ]);
  });

  it("skips matchup llm calls when the key is empty", async () => {
    process.env.ZAI_API_KEY = "";
    process.env.ZAI_ENDPOINT = "https://api.z.ai/api/coding/paas/v4/chat/completions";
    process.env.ZAI_MODEL = "glm-5";

    const configMod = await import("../src/core/config.js");
    const coachMod = await import("../src/core/coach.js");

    configMod.settings.zaiApiKey = "";
    configMod.settings.zaiEndpoint = "https://api.z.ai/api/coding/paas/v4/chat/completions";
    configMod.settings.zaiModel = "glm-5";

    const result = await coachMod.getMatchupTip({
      activePlayerChampion: "Ahri",
      enemyPlayers: [{ championName: "Lux" }],
    });

    expect(result).toBeNull();
    expect(openAiCalls).toHaveLength(0);
  });

  it("syncs coach message mode into loaded core settings without restart", async () => {
    const configService = await import("../src/main/services/config-service.js");
    configService.initConfigStore();

    const { engine } = await import("../src/main/services/engine.js");
    await (engine as unknown as { loadCore: () => Promise<void> }).loadCore();

    configService.setPath("coach.messageMode", "puto");
    engine.syncConfig();

    const configMod = await import("../src/core/config.js");
    expect(configMod.settings.coachMessageMode).toBe("puto");
  });

  it("syncs provider protocol into loaded core settings without restart", async () => {
    const configService = await import("../src/main/services/config-service.js");
    configService.initConfigStore();
    configService.setPath("llm.activeProvider", "custom");
    configService.setPath("llm.providers.custom.apiKey", "test-key");
    configService.setPath("llm.providers.custom.endpoint", "https://api.example/v1/chat/completions");
    configService.setPath("llm.providers.custom.model", "gpt-test");
    configService.setPath("llm.providers.custom.protocol", "chat_completions");

    const { engine } = await import("../src/main/services/engine.js");
    await (engine as unknown as { loadCore: () => Promise<void> }).loadCore();
    const coachMod = await import("../src/core/coach.js");
    const snapshot = {
      activePlayerChampion: "Ahri",
      activePlayerPosition: "MIDDLE",
      enemyPlayers: [{ championName: "Lux", position: "MIDDLE" }],
    };

    await coachMod.getMatchupTip(snapshot);
    expect(chatCalls).toHaveLength(1);
    expect(responseCalls).toHaveLength(0);

    configService.setPath("llm.providers.custom.endpoint", "https://api.example/v1/responses");
    configService.setPath("llm.providers.custom.protocol", "responses");
    engine.syncConfig();
    await coachMod.getMatchupTip(snapshot);

    expect(chatCalls).toHaveLength(1);
    expect(responseCalls).toHaveLength(1);
  });

  it("tests custom LLM providers using their configured protocol", async () => {
    const configService = await import("../src/main/services/config-service.js");
    configService.initConfigStore();
    configService.setPath("llm.providers.custom.apiKey", "custom-key");
    configService.setPath("llm.providers.custom.endpoint", "https://api.example/v1/responses");
    configService.setPath("llm.providers.custom.model", "gpt-test");
    configService.setPath("llm.providers.custom.protocol", "responses");

    const { IPC } = await import("../src/shared/channels.js");
    const { registerIpcHandlers } = await import("../src/main/ipc/handlers.js");
    registerIpcHandlers({ webContents: { send: vi.fn() } } as any);

    const result = await ipcHandlers.get(IPC.LLM_TEST)?.({}, "custom");

    expect(result).toEqual({ ok: true, response: "Troque cedo.", ms: expect.any(Number) });
    expect(openAiCalls).toEqual([{ apiKey: "custom-key", baseURL: "https://api.example/v1" }]);
    expect(chatCalls).toHaveLength(0);
    expect(responseCalls).toEqual([
      {
        model: "gpt-test",
        input: [{ role: "user", content: "Responda apenas: OK" }],
        temperature: undefined,
        max_output_tokens: 10,
      },
    ]);
  });

  it("rejects none and invalid LLM test providers without calling the SDK", async () => {
    const configService = await import("../src/main/services/config-service.js");
    configService.initConfigStore();
    configService.setPath("llm.providers.openai.apiKey", "openai-key");

    const { IPC } = await import("../src/shared/channels.js");
    const { registerIpcHandlers } = await import("../src/main/ipc/handlers.js");
    registerIpcHandlers({ webContents: { send: vi.fn() } } as any);
    const llmTest = ipcHandlers.get(IPC.LLM_TEST);

    await expect(llmTest?.({}, "none")).resolves.toEqual({ ok: false, error: "API key não configurada" });
    await expect(llmTest?.({}, "bogus")).resolves.toEqual({ ok: false, error: "API key não configurada" });
    expect(openAiCalls).toHaveLength(0);
    expect(chatCalls).toHaveLength(0);
    expect(responseCalls).toHaveLength(0);
  });

  it("does not log custom endpoint secrets or raw LLM test responses", async () => {
    mockResponseText = "sensitive response body with player data";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const configService = await import("../src/main/services/config-service.js");
    configService.initConfigStore();
    configService.setPath("llm.providers.custom.apiKey", "custom-key");
    configService.setPath("llm.providers.custom.endpoint", "https://user:pass@api.example/v1/responses?token=secret-token");
    configService.setPath("llm.providers.custom.model", "gpt-test");
    configService.setPath("llm.providers.custom.protocol", "responses");

    const { IPC } = await import("../src/shared/channels.js");
    const { registerIpcHandlers } = await import("../src/main/ipc/handlers.js");
    registerIpcHandlers({ webContents: { send: vi.fn() } } as any);

    await ipcHandlers.get(IPC.LLM_TEST)?.({}, "custom");

    const logs = logSpy.mock.calls.flat().map(String).join(" ");
    logSpy.mockRestore();
    expect(logs).toContain("api.example");
    expect(logs).not.toContain("user:pass");
    expect(logs).not.toContain("secret-token");
    expect(logs).not.toContain(mockResponseText);
  });
});
