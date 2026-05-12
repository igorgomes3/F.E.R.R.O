import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import { TacticalMemory } from "../src/core/tactical-memory.js";

let storeData: Record<string, unknown> = {};
let currentSnapshot: Record<string, unknown> | null = null;

const logger = {
  log: vi.fn(async () => {}),
  logGame: vi.fn(async () => {}),
  newSession: vi.fn(async () => ({})),
  filePath: "mock-log.jsonl",
  gameFilePath: "mock-game.jsonl",
};

const coreSettings: Record<string, unknown> = {
  pollIntervalSeconds: 5,
  coachingIntervalSeconds: 20,
  mapReminderIntervalSeconds: 45,
  stalledGoldThreshold: 1500,
  dragonFirstSpawnSeconds: 300,
  dragonRespawnSeconds: 300,
  grubsFirstSpawnSeconds: 480,
  grubsDespawnSeconds: 885,
  heraldFirstSpawnSeconds: 900,
  heraldDespawnSeconds: 1185,
  baronFirstSpawnSeconds: 1200,
  baronRespawnSeconds: 360,
  objectiveOneMinuteCallSeconds: 70,
  objectiveThirtySecondsCallSeconds: 35,
  objectiveTenSecondsCallSeconds: 12,
  ttsEnabled: true,
  ttsProvider: "say",
  ttsVoice: "",
  piperExecutable: "",
  piperModelPath: "",
  piperSpeaker: -1,
  elevenlabsApiKey: "",
  elevenlabsVoiceId: "",
  coachMessageMode: "serio",
  logsDir: "logs",
  logSnapshots: false,
  logLlmPayloads: false,
};

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

vi.mock("../src/core/analyzer.js", () => ({
  analyzeSnapshot: vi.fn(async () => ({
    triggers: [],
    strategicContext: { objectiveStates: [] },
  })),
  sortTriggersByUrgency: vi.fn((triggers: string[]) => triggers),
}));

vi.mock("../src/core/coach.js", () => ({
  decideCoaching: vi.fn(async () => ({
    shouldSpeak: false,
    message: "",
    reason: "sem gatilho e fora do intervalo",
    priority: null,
    prompt: "",
    rawModelMessage: "",
    fallbackUsed: false,
    llmMs: 0,
    llmError: null,
    skippedLlm: true,
  })),
  detectCategory: vi.fn(() => "generico"),
  getCategoryCooldown: vi.fn(() => 30),
  getMatchupTip: vi.fn(async () => null),
}));

vi.mock("../src/core/game.js", () => ({
  getSnapshot: vi.fn(async () => currentSnapshot),
}));

vi.mock("../src/core/voice.js", () => ({
  speak: vi.fn(async () => ({ generateMs: 0, provider: "mock" })),
}));

vi.mock("../src/core/logger.js", () => ({
  createLogger: vi.fn(async () => logger),
}));

vi.mock("../src/core/state.js", () => {
  class MockLoopState {
    lastCoachingAt = 0;
    lastGameTime: number | null = null;
    hasLoggedWaitingState = false;
    matchupDone = true;
    openingGreetingDone = true;
    pendingTriggers: string[] = [];

    queueTriggers(triggers: string[]) {
      this.pendingTriggers.push(...triggers);
    }

    drainPendingTriggers() {
      return this.pendingTriggers.splice(0);
    }

    canRepeatMessage() {
      return true;
    }

    canRepeatGroup() {
      return true;
    }

    canSpeakGlobal() {
      return true;
    }

    markMessageSpoken() {}
    markGlobalSpeak() {}
    markGroupSpoken() {}

    detectGameReset(currentGameTime: number) {
      return this.lastGameTime !== null && currentGameTime < this.lastGameTime - 10;
    }

    reset() {
      this.lastCoachingAt = 0;
      this.lastGameTime = null;
      this.hasLoggedWaitingState = false;
      this.matchupDone = true;
      this.openingGreetingDone = true;
      this.pendingTriggers = [];
    }
  }

  return { LoopState: MockLoopState };
});

vi.mock("../src/core/config.js", () => ({
  settings: coreSettings,
}));

vi.mock("../src/core/constants.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/constants.js")>();
  return { ...actual, pickModePhrase: vi.fn(() => "Inicio") };
});

function makeSnapshot(gameTime: number) {
  return {
    gameTime,
    activePlayerName: "player",
    activePlayerChampion: "Ahri",
    activePlayerLevel: 1,
    activePlayerGold: 0,
    activePlayerKda: "0/0/0",
    alliedPlayers: [],
    enemyPlayers: [],
  };
}

describe("TacticalMemory", () => {
  it("registers enemy Ashe flash cooldown from 'Ashe flashou'", () => {
    const memory = new TacticalMemory();

    const result = memory.handleText("Ashe flashou", 120);

    expect(result.ok).toBe(true);
    expect(result.kind).toBe("registered");
    expect(result.cooldowns).toEqual([
      expect.objectContaining({
        champion: "Ashe",
        spell: "flash",
        source: "manual",
        confidence: "confirmed",
        usedAtSeconds: 120,
        readyAtSeconds: 420,
        isEnemy: true,
      }),
    ]);
  });

  it("registers Zed ultimate estimate from 'Zed sem ult'", () => {
    const memory = new TacticalMemory();

    const result = memory.handleText("Zed sem ult", 300);

    expect(result.ok).toBe(true);
    expect(result.kind).toBe("registered");
    expect(result.cooldowns).toEqual([
      expect.objectContaining({
        champion: "Zed",
        spell: "ultimate",
        source: "manual",
        confidence: "estimated",
        usedAtSeconds: 300,
        readyAtSeconds: 420,
        isEnemy: true,
      }),
    ]);
  });

  it.each([
    ["Lee Sin flashou", "Lee Sin", "flash", 400],
    ["Miss Fortune flashou", "Miss Fortune", "flash", 400],
    ["Aurelion Sol sem ult", "Aurelion Sol", "ultimate", 220],
    ["Master Yi flashou", "Master Yi", "flash", 400],
    ["Renata Glasc flashou", "Renata Glasc", "flash", 400],
    ["Tahm Kench flashou", "Tahm Kench", "flash", 400],
    ["Xin Zhao flashou", "Xin Zhao", "flash", 400],
    ["Nunu & Willump flashou", "Nunu & Willump", "flash", 400],
    ["Dr. Mundo flashou", "Dr. Mundo", "flash", 400],
    ["renata glasc flashou", "Renata Glasc", "flash", 400],
  ] as const)("registers multi-word champion phrase '%s'", (input, champion, spell, readyAtSeconds) => {
    const memory = new TacticalMemory();

    const result = memory.handleText(input, 100);

    expect(result.ok).toBe(true);
    expect(result.kind).toBe("registered");
    expect(result.cooldowns).toEqual([
      expect.objectContaining({
        champion,
        spell,
        readyAtSeconds,
      }),
    ]);
  });

  it.each([
    ["heal", "heal", 240],
    ["ignite", "ignite", 180],
    ["exhaust", "exhaust", 240],
    ["cleanse", "cleanse", 240],
    ["ghost", "ghost", 210],
    ["teleport", "teleport", 360],
    ["tp", "teleport", 360],
    ["smite", "smite", 90],
  ] as const)("registers required spell alias '%s'", (alias, spell, cooldownSeconds) => {
    const memory = new TacticalMemory();

    const result = memory.handleText(`Ashe ${alias}`, 100);

    expect(result.ok).toBe(true);
    expect(result.kind).toBe("registered");
    expect(result.cooldowns).toEqual([
      expect.objectContaining({
        champion: "Ashe",
        spell,
        source: "manual",
        confidence: "confirmed",
        usedAtSeconds: 100,
        readyAtSeconds: 100 + cooldownSeconds,
        isEnemy: true,
      }),
    ]);
  });

  it("answers 'Ashe tem flash?' from active memory", () => {
    const memory = new TacticalMemory();
    memory.handleText("Ashe flashou", 120);

    const result = memory.handleText("Ashe tem flash?", 200);

    expect(result.ok).toBe(true);
    expect(result.kind).toBe("query");
    expect(result.message).toContain("Ashe flash volta em 03:40");
    expect(result.cooldowns).toEqual([
      expect.objectContaining({
        champion: "Ashe",
        spell: "flash",
        confidence: "confirmed",
        readyAtSeconds: 420,
      }),
    ]);
  });

  it("answers query phrase containing 'quando volta'", () => {
    const memory = new TacticalMemory();
    memory.handleText("Ashe flashou", 120);

    const result = memory.handleText("Ashe quando volta flash", 200);

    expect(result.ok).toBe(true);
    expect(result.kind).toBe("query");
    expect(result.message).toContain("Ashe flash volta em 03:40");
    expect(result.cooldowns).toEqual([
      expect.objectContaining({
        champion: "Ashe",
        spell: "flash",
        confidence: "confirmed",
      }),
    ]);
  });

  it("marks expired cooldowns as ready and expired", () => {
    const memory = new TacticalMemory();
    memory.handleText("Ashe flashou", 120);

    const listed = memory.listCooldowns(421);
    const query = memory.handleText("Ashe voltou flash?", 421);

    expect(listed).toEqual([
      expect.objectContaining({
        champion: "Ashe",
        spell: "flash",
        confidence: "expired",
        readyAtSeconds: 420,
      }),
    ]);
    expect(query.kind).toBe("query");
    expect(query.message).toContain("Ashe flash pronto");
    expect(query.cooldowns?.[0]).toEqual(expect.objectContaining({ confidence: "expired" }));
  });

  it("marks cooldowns expired at the exact ready second in list and query", () => {
    const memory = new TacticalMemory();
    memory.handleText("Ashe flashou", 120);

    const listed = memory.listCooldowns(420);
    const query = memory.handleText("Ashe tem flash?", 420);

    expect(listed).toEqual([
      expect.objectContaining({
        champion: "Ashe",
        spell: "flash",
        confidence: "expired",
        readyAtSeconds: 420,
      }),
    ]);
    expect(query.kind).toBe("query");
    expect(query.message).toContain("Ashe flash pronto");
    expect(query.cooldowns?.[0]).toEqual(expect.objectContaining({ confidence: "expired" }));
  });

  it("clears stored cooldowns on reset", () => {
    const memory = new TacticalMemory();
    memory.handleText("Ashe flashou", 120);

    memory.reset();

    expect(memory.listCooldowns(200)).toEqual([]);
    expect(memory.handleText("Ashe tem flash?", 200)).toMatchObject({
      ok: true,
      kind: "query",
      cooldowns: [],
    });
  });

  it("returns unknown for unsupported or incomplete phrases", () => {
    const memory = new TacticalMemory();

    expect(memory.handleText("Ashe dançou", 100)).toMatchObject({
      ok: false,
      kind: "unknown",
    });
    expect(memory.handleText("flashou", 100)).toMatchObject({
      ok: false,
      kind: "unknown",
    });
  });
});

describe("Engine tactical memory", () => {
  beforeEach(() => {
    vi.resetModules();
    storeData = {};
    currentSnapshot = null;
    logger.log.mockClear();
    logger.logGame.mockClear();
    logger.newSession.mockClear();
  });

  it("handles commands, lists cooldowns, and resets memory at engine game time", async () => {
    const { Engine } = await import("../src/main/services/engine.js");
    const engine = new Engine();

    engine.engineState.gameDetected = true;
    engine.engineState.gameTime = 120;

    const result = engine.handleTacticalCommand("Ashe flashou");

    expect(result).toMatchObject({
      ok: true,
      kind: "registered",
      cooldowns: [
        expect.objectContaining({
          champion: "Ashe",
          spell: "flash",
          usedAtSeconds: 120,
          readyAtSeconds: 420,
        }),
      ],
    });
    expect(engine.listTacticalCooldowns()).toEqual([
      expect.objectContaining({
        champion: "Ashe",
        spell: "flash",
        readyAtSeconds: 420,
      }),
    ]);

    engine.resetTacticalMemory();

    expect(engine.listTacticalCooldowns()).toEqual([]);
  });

  it("uses zero game time for commands before a game is active", async () => {
    const { Engine } = await import("../src/main/services/engine.js");
    const engine = new Engine();

    engine.engineState.gameDetected = false;
    engine.engineState.gameTime = 120;

    const result = engine.handleTacticalCommand("Ashe flashou");

    expect(result.cooldowns).toEqual([
      expect.objectContaining({
        usedAtSeconds: 0,
        readyAtSeconds: 300,
      }),
    ]);
  });

  it("returns an invalid command result for non-string tactical commands", async () => {
    const { Engine } = await import("../src/main/services/engine.js");
    const engine = new Engine();

    const result = (engine as unknown as { handleTacticalCommand(text: unknown): unknown }).handleTacticalCommand(123);

    expect(result).toEqual({
      ok: false,
      kind: "unknown",
      message: "Comando tatico invalido.",
    });
  });

  it("resets tactical memory when a game ends", async () => {
    const { Engine } = await import("../src/main/services/engine.js");
    const engine = new Engine();
    await engine.start();
    if ((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId) {
      clearInterval((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId as ReturnType<typeof setInterval>);
      (engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId = null;
    }

    currentSnapshot = makeSnapshot(120);
    await (engine as unknown as { tick: () => Promise<void> }).tick();
    engine.handleTacticalCommand("Ashe flashou");
    expect(engine.listTacticalCooldowns()).toHaveLength(1);

    currentSnapshot = null;
    await (engine as unknown as { tick: () => Promise<void> }).tick();

    expect(engine.listTacticalCooldowns()).toEqual([]);
    engine.stop();
  });

  it("resets tactical memory when the engine detects a game reset", async () => {
    const { Engine } = await import("../src/main/services/engine.js");
    const engine = new Engine();
    await engine.start();
    if ((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId) {
      clearInterval((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId as ReturnType<typeof setInterval>);
      (engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId = null;
    }

    currentSnapshot = makeSnapshot(600);
    await (engine as unknown as { tick: () => Promise<void> }).tick();
    engine.handleTacticalCommand("Ashe flashou");
    expect(engine.listTacticalCooldowns()).toHaveLength(1);

    currentSnapshot = makeSnapshot(20);
    await (engine as unknown as { tick: () => Promise<void> }).tick();

    expect(engine.listTacticalCooldowns()).toEqual([]);
    engine.stop();
  });
});

describe("TacticalMemoryPanel", () => {
  it("refreshes tactical cooldowns on a mounted interval", () => {
    const source = readFileSync(new URL("../src/renderer/components/dashboard/TacticalMemoryPanel.tsx", import.meta.url), "utf8");

    expect(source).toContain("setInterval");
    expect(source).toContain("clearInterval");
    expect(source).toContain("listTacticalCooldowns");
  });
});
