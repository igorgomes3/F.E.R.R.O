import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock electron-store before importing config-service
vi.mock("electron-store", () => {
  const data: Record<string, unknown> = {};
  return {
    default: class MockStore {
      constructor(opts: { defaults?: Record<string, unknown> }) {
        if (opts.defaults) Object.assign(data, JSON.parse(JSON.stringify(opts.defaults)));
      }
      get store() { return JSON.parse(JSON.stringify(data)); }
      get(key: string) {
        const keys = key.split(".");
        let obj: unknown = data;
        for (const k of keys) obj = (obj as Record<string, unknown>)?.[k];
        return obj;
      }
      set(key: string, value: unknown) {
        const keys = key.split(".");
        let obj: Record<string, unknown> = data;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!obj[keys[i]]) obj[keys[i]] = {};
          obj = obj[keys[i]] as Record<string, unknown>;
        }
        obj[keys[keys.length - 1]] = value;
      }
      clear() { for (const k of Object.keys(data)) delete data[k]; }
    },
  };
});

describe("settings-bridge", () => {
  beforeEach(() => {
    // Reset process.env
    delete process.env.ZAI_API_KEY;
    delete process.env.TTS_PROVIDER;
    delete process.env.TTS_ENABLED;
    delete process.env.COACH_MESSAGE_MODE;
    delete process.env.LLM_PROTOCOL;
  });

  it("sets empty LLM vars when activeProvider is 'none'", async () => {
    const { initConfigStore } = await import("../src/main/services/config-service.js");
    initConfigStore();
    const { populateEnvFromConfig } = await import("../src/main/lib/settings-bridge.js");

    populateEnvFromConfig();

    expect(process.env.ZAI_API_KEY).toBe("");
    expect(process.env.ZAI_ENDPOINT).toBe("");
    expect(process.env.ZAI_MODEL).toBe("");
    expect(process.env.LLM_PROTOCOL).toBe("chat_completions");
  });

  it("sets LLM_PROTOCOL from active provider protocol", async () => {
    const { initConfigStore, setPath } = await import("../src/main/services/config-service.js");
    initConfigStore();
    setPath("llm.activeProvider", "openai");
    setPath("llm.providers.openai.protocol", "responses");
    const { populateEnvFromConfig } = await import("../src/main/lib/settings-bridge.js");

    populateEnvFromConfig();

    expect(process.env.LLM_PROTOCOL).toBe("responses");
  });

  it("defaults LLM_PROTOCOL to chat_completions when active provider has no protocol", async () => {
    const { initConfigStore, setPath } = await import("../src/main/services/config-service.js");
    initConfigStore();
    setPath("llm.activeProvider", "openai");
    const { populateEnvFromConfig } = await import("../src/main/lib/settings-bridge.js");

    populateEnvFromConfig();

    expect(process.env.LLM_PROTOCOL).toBe("chat_completions");
  });

  it("sets TTS_ENABLED to true always", async () => {
    const { initConfigStore } = await import("../src/main/services/config-service.js");
    initConfigStore();
    const { populateEnvFromConfig } = await import("../src/main/lib/settings-bridge.js");

    populateEnvFromConfig();

    expect(process.env.TTS_ENABLED).toBe("true");
  });

  it("maps piper provider to TTS_PROVIDER=piper", async () => {
    const { initConfigStore } = await import("../src/main/services/config-service.js");
    initConfigStore();
    const { populateEnvFromConfig } = await import("../src/main/lib/settings-bridge.js");

    populateEnvFromConfig();

    expect(process.env.TTS_PROVIDER).toBe("piper");
  });

  it("maps system provider to TTS_PROVIDER=say", async () => {
    const { initConfigStore, setPath } = await import("../src/main/services/config-service.js");
    initConfigStore();
    setPath("tts.activeProvider", "system");
    const { populateEnvFromConfig } = await import("../src/main/lib/settings-bridge.js");

    populateEnvFromConfig();

    expect(process.env.TTS_PROVIDER).toBe("say");
  });

  it("sets objective timers from config", async () => {
    const { initConfigStore } = await import("../src/main/services/config-service.js");
    initConfigStore();
    const { populateEnvFromConfig } = await import("../src/main/lib/settings-bridge.js");

    populateEnvFromConfig();

    expect(process.env.DRAGON_FIRST_SPAWN_SECONDS).toBe("300");
    expect(process.env.BARON_RESPAWN_SECONDS).toBe("360");
    expect(process.env.GRUBS_FIRST_SPAWN_SECONDS).toBe("480");
  });

  it("exports coach message mode from config", async () => {
    const { initConfigStore, setPath } = await import("../src/main/services/config-service.js");
    initConfigStore();
    setPath("coach.messageMode", "puto");
    const { populateEnvFromConfig } = await import("../src/main/lib/settings-bridge.js");

    populateEnvFromConfig();

    expect(process.env.COACH_MESSAGE_MODE).toBe("puto");
  });
});
