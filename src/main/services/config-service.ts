import path from "path";
import os from "os";
import Store from "electron-store";
import type { FerroConfig } from "../../shared/types";

const FERROCONFIG_DIR = path.join(os.homedir(), ".ferroconfig");

const DEFAULT_CONFIG: FerroConfig = {
  llm: {
    activeProvider: "none",
    providers: {
      zai: {
        apiKey: "",
        endpoint: "https://api.z.ai/api/coding/paas/v4/chat/completions",
        model: "glm-5",
      },
      openai: {
        apiKey: "",
        endpoint: "https://api.openai.com/v1/chat/completions",
        model: "gpt-4o-mini",
      },
      gemini: {
        apiKey: "",
        endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        model: "gemini-2.0-flash",
      },
      custom: {
        apiKey: "",
        endpoint: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        protocol: "responses",
        models: ["gpt-4o-mini"],
      },
    },
  },
  tts: {
    activeProvider: "piper",
    volume: 0.8,
    providers: {
      piper: {
        executablePath: path.join(FERROCONFIG_DIR, "piper", "piper.exe"),
        modelPath: "",
        speaker: -1,
      },
      elevenlabs: { apiKey: "", voiceId: "" },
      system: { voice: "Microsoft Maria Desktop" },
    },
  },
  coach: {
    messageMode: "serio",
  },
  game: {
    pollIntervalSeconds: 5,
    coachingIntervalSeconds: 20,
    mapReminderIntervalSeconds: 45,
    stalledGoldThreshold: 1500,
  },
  objectives: {
    dragonFirstSpawn: 300,
    dragonRespawn: 300,
    grubsFirstSpawn: 480,
    grubsDespawn: 885,
    heraldFirstSpawn: 900,
    heraldDespawn: 1185,
    baronFirstSpawn: 1200,
    baronRespawn: 360,
    oneMinuteCall: 70,
    thirtySecondsCall: 35,
    tenSecondsCall: 12,
  },
  messages: {
    objetivo: { enabled: true, cooldownSeconds: 15 },
    torre: { enabled: true, cooldownSeconds: 30 },
    torrePerdida: { enabled: true, cooldownSeconds: 30 },
    morteJogador: { enabled: true, cooldownSeconds: 90 },
    morteStreak: { enabled: true, cooldownSeconds: 180 },
    itemFechado: { enabled: true, cooldownSeconds: 30 },
    inimigoItem: { enabled: true, cooldownSeconds: 60 },
    powerspike: { enabled: true, cooldownSeconds: 60 },
    mapa: { enabled: true, cooldownSeconds: 50 },
    inimigoFed: { enabled: true, cooldownSeconds: 120 },
    inimigoBuild: { enabled: true, cooldownSeconds: 120 },
    ouroParado: { enabled: true, cooldownSeconds: 120 },
    levelUp: { enabled: true, cooldownSeconds: 30 },
    inibidor: { enabled: true, cooldownSeconds: 60 },
    generico: { enabled: true, cooldownSeconds: 30 },
  },
  logging: {
    logsDir: path.join(FERROCONFIG_DIR, "logs"),
    logSnapshots: true,
    logLlmPayloads: true,
  },
  app: {
    onboardingCompleted: false,
    windowBounds: null,
  },
};

let store: Store<FerroConfig>;

export function initConfigStore(): Store<FerroConfig> {
  store = new Store<FerroConfig>({
    name: "config",
    defaults: DEFAULT_CONFIG,
  });
  return store;
}

export function getConfigStore(): Store<FerroConfig> {
  if (!store) return initConfigStore();
  return store;
}

export function getAll(): FerroConfig {
  return normalizeConfig(getConfigStore().store);
}

export function get<K extends keyof FerroConfig>(key: K): FerroConfig[K] {
  return getAll()[key];
}

export function set<K extends keyof FerroConfig>(key: K, value: FerroConfig[K]): void {
  getConfigStore().set(key, value);
}

export function setPath(path: string, value: unknown): void {
  getConfigStore().set(path as keyof FerroConfig, value as never);
}

export function reset(): void {
  getConfigStore().clear();
}

function normalizeConfig(config: FerroConfig): FerroConfig {
  return mergeDefaults(DEFAULT_CONFIG, config);
}

function mergeDefaults<T>(defaults: T, value: unknown): T {
  if (!isPlainObject(defaults)) return value === undefined ? defaults : (value as T);

  const result: Record<string, unknown> = { ...defaults };
  if (!isPlainObject(value)) return result as T;

  for (const [key, nextValue] of Object.entries(value)) {
    const defaultValue = (defaults as Record<string, unknown>)[key];
    result[key] = isPlainObject(defaultValue) ? mergeDefaults(defaultValue, nextValue) : nextValue;
  }

  return result as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
