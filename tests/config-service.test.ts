import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("electron-store", () => {
  let data: Record<string, unknown> = {};
  return {
    default: class MockStore {
      constructor(opts: { defaults?: Record<string, unknown> }) {
        data = opts.defaults ? JSON.parse(JSON.stringify(opts.defaults)) : {};
      }
      get store() { return JSON.parse(JSON.stringify(data)); }
      get(key: string) {
        const keys = key.split(".");
        let obj: unknown = data;
        for (const k of keys) obj = (obj as Record<string, unknown>)?.[k];
        return obj;
      }
      set(key: string, value: unknown) {
        if (typeof key === "string" && typeof value === "object" && value !== null && !Array.isArray(value) && key in data) {
          Object.assign(data[key] as Record<string, unknown>, value);
          return;
        }
        const keys = key.split(".");
        let obj: Record<string, unknown> = data;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!obj[keys[i]] || typeof obj[keys[i]] !== "object") obj[keys[i]] = {};
          obj = obj[keys[i]] as Record<string, unknown>;
        }
        obj[keys[keys.length - 1]] = value;
      }
      clear() { data = {}; }
    },
  };
});

describe("config-service", () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it("getAll returns default config with correct message categories", async () => {
    const { initConfigStore, getAll } = await import("../src/main/services/config-service.js");
    initConfigStore();
    const config = getAll();

    // Must have all real categories from CATEGORY_COOLDOWNS
    expect(config.messages.objetivo).toEqual({ enabled: true, cooldownSeconds: 15 });
    expect(config.messages.torre).toEqual({ enabled: true, cooldownSeconds: 30 });
    expect(config.messages.torrePerdida).toEqual({ enabled: true, cooldownSeconds: 30 });
    expect(config.messages.morteJogador).toEqual({ enabled: true, cooldownSeconds: 90 });
    expect(config.messages.morteStreak).toEqual({ enabled: true, cooldownSeconds: 180 });
    expect(config.messages.itemFechado).toEqual({ enabled: true, cooldownSeconds: 30 });
    expect(config.messages.inimigoItem).toEqual({ enabled: true, cooldownSeconds: 60 });
    expect(config.messages.powerspike).toEqual({ enabled: true, cooldownSeconds: 60 });
    expect(config.messages.mapa).toEqual({ enabled: true, cooldownSeconds: 50 });
    expect(config.messages.inimigoFed).toEqual({ enabled: true, cooldownSeconds: 120 });
    expect(config.messages.inimigoBuild).toEqual({ enabled: true, cooldownSeconds: 120 });
    expect(config.messages.ouroParado).toEqual({ enabled: true, cooldownSeconds: 120 });
    expect(config.messages.levelUp).toEqual({ enabled: true, cooldownSeconds: 30 });
    expect(config.messages.inibidor).toEqual({ enabled: true, cooldownSeconds: 60 });
    expect(config.messages.generico).toEqual({ enabled: true, cooldownSeconds: 30 });

    // Must NOT have old wrong keys
    expect(config.messages).not.toHaveProperty("kill");
    expect(config.messages).not.toHaveProperty("morte");
    expect(config.messages).not.toHaveProperty("item");
    expect(config.messages).not.toHaveProperty("counterItem");
    expect(config.coach.messageMode).toBe("serio");
  });

  it("default LLM provider is 'none'", async () => {
    const { initConfigStore, getAll } = await import("../src/main/services/config-service.js");
    initConfigStore();
    expect(getAll().llm.activeProvider).toBe("none");
  });

  it("includes default custom LLM provider config", async () => {
    const { initConfigStore, getAll } = await import("../src/main/services/config-service.js");
    initConfigStore();

    expect(getAll().llm.providers.custom).toEqual({
      apiKey: "",
      endpoint: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      protocol: "responses",
      models: ["gpt-4o-mini"],
    });
  });

  it("normalizes legacy LLM config that is missing the custom provider", async () => {
    const { initConfigStore, getAll, get, set } = await import("../src/main/services/config-service.js");
    initConfigStore();

    set("llm", {
      activeProvider: "custom",
      providers: {
        zai: { apiKey: "zai-key", endpoint: "https://zai.example", model: "glm-custom" },
        openai: { apiKey: "openai-key", endpoint: "https://openai.example", model: "gpt-custom" },
        gemini: { apiKey: "gemini-key", endpoint: "https://gemini.example", model: "gemini-custom" },
      },
    } as never);

    const llm = getAll().llm;
    expect(llm.activeProvider).toBe("custom");
    expect(llm.providers.zai).toEqual({ apiKey: "zai-key", endpoint: "https://zai.example", model: "glm-custom" });
    expect(llm.providers.custom).toEqual({
      apiKey: "",
      endpoint: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      protocol: "responses",
      models: ["gpt-4o-mini"],
    });
    expect(get("llm").providers.custom.models).toEqual(["gpt-4o-mini"]);
  });

  it("normalizes legacy custom provider without wiping user values", async () => {
    const { initConfigStore, getAll, set } = await import("../src/main/services/config-service.js");
    initConfigStore();

    set("llm", {
      activeProvider: "custom",
      providers: {
        custom: {
          apiKey: "custom-key",
          endpoint: "https://custom.example/v1/chat/completions",
          model: "custom-model",
        },
      },
    } as never);

    expect(getAll().llm.providers.custom).toEqual({
      apiKey: "custom-key",
      endpoint: "https://custom.example/v1/chat/completions",
      model: "custom-model",
      protocol: "responses",
      models: ["gpt-4o-mini"],
    });
  });

  it("default TTS provider is 'piper'", async () => {
    const { initConfigStore, getAll } = await import("../src/main/services/config-service.js");
    initConfigStore();
    expect(getAll().tts.activeProvider).toBe("piper");
  });

  it("piper executablePath points to ~/.ferroconfig/piper/piper.exe", async () => {
    const { initConfigStore, getAll } = await import("../src/main/services/config-service.js");
    initConfigStore();
    const p = getAll().tts.providers.piper.executablePath;
    expect(p).toContain(".ferroconfig");
    expect(p).toContain("piper.exe");
  });

  it("logs dir points to ~/.ferroconfig/logs", async () => {
    const { initConfigStore, getAll } = await import("../src/main/services/config-service.js");
    initConfigStore();
    expect(getAll().logging.logsDir).toContain(".ferroconfig");
    expect(getAll().logging.logsDir).toContain("logs");
  });

  it("setPath updates nested values", async () => {
    const { initConfigStore, setPath, getAll } = await import("../src/main/services/config-service.js");
    initConfigStore();
    setPath("messages.mapa.enabled", false);
    expect(getAll().messages.mapa.enabled).toBe(false);
  });

  it("setPath updates message cooldown", async () => {
    const { initConfigStore, setPath, getAll } = await import("../src/main/services/config-service.js");
    initConfigStore();
    setPath("messages.objetivo.cooldownSeconds", 45);
    expect(getAll().messages.objetivo.cooldownSeconds).toBe(45);
  });

  it("setPath updates coach message mode", async () => {
    const { initConfigStore, setPath, getAll } = await import("../src/main/services/config-service.js");
    initConfigStore();
    setPath("coach.messageMode", "puto");
    expect(getAll().coach.messageMode).toBe("puto");
    expect(getAll().messages.mapa.enabled).toBe(true);
  });
});
