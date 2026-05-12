import { beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import path from "path";

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

describe("voice input config", () => {
  beforeEach(() => vi.resetModules());

  const defaultWhisperPath = path.join(os.homedir(), ".ferroconfig", "whisper", "whisper-cli.exe");

  it("includes safe default voice input settings", async () => {
    const { initConfigStore, getAll } = await import("../src/main/services/config-service.js");
    initConfigStore();

    expect(getAll().voiceInput).toEqual({
      enabled: false,
      mode: "push_to_talk",
      pushToTalkHotkey: "Alt+Space",
      toggleHotkey: "Alt+Shift+Space",
      stt: {
        provider: "whisper_cpp",
        executablePath: defaultWhisperPath,
        modelPath: "",
        language: "pt",
        threads: 4,
      },
    });
    expect(getAll().tts.enabled).toBe(true);
  });

  it("normalizes legacy config without voiceInput", async () => {
    const { initConfigStore, reset, set, getAll } = await import("../src/main/services/config-service.js");
    initConfigStore();
    reset();
    set("app", { onboardingCompleted: true, windowBounds: null } as never);

    expect(getAll().voiceInput).toEqual({
      enabled: false,
      mode: "push_to_talk",
      pushToTalkHotkey: "Alt+Space",
      toggleHotkey: "Alt+Shift+Space",
      stt: {
        provider: "whisper_cpp",
        executablePath: defaultWhisperPath,
        modelPath: "",
        language: "pt",
        threads: 4,
      },
    });
  });

  it("normalizes legacy tts config without enabled", async () => {
    const { initConfigStore, reset, set, getAll } = await import("../src/main/services/config-service.js");
    initConfigStore();
    reset();
    set("tts", {
      activeProvider: "piper",
      volume: 0.8,
      providers: {
        piper: {
          executablePath: path.join(os.homedir(), ".ferroconfig", "piper", "piper.exe"),
          modelPath: "",
          speaker: -1,
        },
        elevenlabs: { apiKey: "", voiceId: "" },
        system: { voice: "Microsoft Maria Desktop" },
      },
    } as never);

    expect(getAll().tts.enabled).toBe(true);
  });
});
