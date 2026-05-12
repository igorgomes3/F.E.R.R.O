import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import { TacticalMemory } from "../src/core/tactical-memory.js";

let storeData: Record<string, unknown> = {};
let currentSnapshot: Record<string, unknown> | null = null;
let pendingSnapshot: Promise<Record<string, unknown> | null> | null = null;

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

function makeEnemyPlayer(championName: string, level: number, items: Array<{ id: number; name: string }> = []) {
  return {
    summonerName: `${championName}Player`,
    championName,
    level,
    kills: 0,
    deaths: 0,
    assists: 0,
    creepScore: 0,
    currentGold: 0,
    items,
    position: "MIDDLE",
    wardScore: 0,
  };
}

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
  getSnapshot: vi.fn(async () => pendingSnapshot ?? currentSnapshot),
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
        id: "ashe:flash",
        spell: "flash",
        source: "manual",
        confidence: "confirmed",
        baseCooldownSeconds: 300,
        adjustedCooldownSeconds: 300,
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

  it("adjusts Zed ultimate estimate from enemy level and ability haste items", () => {
    const memory = new TacticalMemory();

    const result = memory.handleText("Zed sem ult", 300, {
      enemyPlayers: [
        {
          championName: "Zed",
          level: 11,
          items: [{ id: 3158, name: "Ionian Boots of Lucidity" }],
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.kind).toBe("registered");
    expect(result.cooldowns).toEqual([
      expect.objectContaining({
        champion: "Zed",
        spell: "ultimate",
        baseCooldownSeconds: 100,
        adjustedCooldownSeconds: 91,
        readyAtSeconds: 391,
        notes: "Estimado com 10 ability haste.",
      }),
    ]);
    expect(result.cooldowns?.[0]?.adjustedCooldownSeconds).toBeLessThan(
      result.cooldowns?.[0]?.baseCooldownSeconds ?? 0,
    );
  });

  it("registers enemy status fact from fallback status phrase", () => {
    const memory = new TacticalMemory();

    const result = memory.handleText("Zed sem sombra", 500);

    expect(result.ok).toBe(true);
    expect(result.kind).toBe("registered");
    expect(result.message).toBe("Anotado: Zed sem sombra.");
    expect(result.facts).toEqual([
      {
        id: "status:zed:500:sem-sombra",
        kind: "status",
        champion: "Zed",
        team: "enemy",
        source: "manual",
        confidence: "confirmed",
        text: "Zed sem sombra",
        gameTimeSeconds: 500,
        createdAt: expect.any(String),
      },
    ]);
    expect(memory.listFacts()).toEqual(result.facts);
  });

  it("formats active cooldowns and recent facts for coach context", () => {
    const memory = new TacticalMemory();
    memory.handleText("Ashe flashou", 120);
    memory.handleText("Zed sem ult", 180);
    memory.handleText("Zed sem sombra", 190);

    const context = memory.formatCoachContext(200);

    expect(context).toContain("Ashe flash volta em 03:40");
    expect(context).toContain("Zed ultimate volta em 01:40");
    expect(context).toContain("Zed sem sombra");
  });

  it("returns a copy of newly registered status facts", () => {
    const memory = new TacticalMemory();

    const result = memory.handleText("Zed sem sombra", 500);
    if (result.kind !== "registered" || !result.facts?.[0]) {
      throw new Error("Expected status fact registration");
    }
    result.facts[0].text = "mutated outside memory";

    expect(memory.listFacts()).toEqual([
      expect.objectContaining({
        id: "status:zed:500:sem-sombra",
        text: "Zed sem sombra",
      }),
    ]);
  });

  it("keeps same-second status facts with distinct text IDs", () => {
    const memory = new TacticalMemory();

    memory.handleText("Zed sem sombra", 500);
    memory.handleText("Zed gastou clone", 500);

    expect(memory.listFacts()).toEqual([
      expect.objectContaining({ id: "status:zed:500:sem-sombra", text: "Zed sem sombra" }),
      expect.objectContaining({ id: "status:zed:500:gastou-clone", text: "Zed gastou clone" }),
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

  it("returns a copy of newly registered cooldowns", () => {
    const memory = new TacticalMemory();

    const result = memory.handleText("Ashe flashou", 120);
    if (result.kind !== "registered" || !result.cooldowns?.[0]) {
      throw new Error("Expected cooldown registration");
    }
    result.cooldowns[0].readyAtSeconds = 999;

    expect(memory.listCooldowns(200)).toEqual([
      expect.objectContaining({
        champion: "Ashe",
        spell: "flash",
        readyAtSeconds: 420,
      }),
    ]);
  });

  it.each(["Ashe nao tem flash", "Ashe não tem flash"] as const)("registers negated flash phrase '%s'", (input) => {
    const memory = new TacticalMemory();

    const result = memory.handleText(input, 120);

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

  it("answers 'Ashe tem flash' without question mark as a query", () => {
    const memory = new TacticalMemory();
    memory.handleText("Ashe flashou", 120);

    const result = memory.handleText("Ashe tem flash", 200);

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

  it("answers grouped flash query with active cooldowns sorted by ready time", () => {
    const memory = new TacticalMemory();
    memory.handleText("Ashe flashou", 100);
    memory.handleText("Zed flashou", 150);

    const result = memory.handleText("Quem esta sem flash?", 200);

    expect(result.ok).toBe(true);
    expect(result.kind).toBe("query");
    expect(result.message).toContain("Ashe flash volta em 03:20");
    expect(result.message).toContain("Zed flash volta em 04:10");
    expect(result.cooldowns).toEqual([
      expect.objectContaining({
        champion: "Ashe",
        spell: "flash",
        confidence: "confirmed",
        readyAtSeconds: 400,
      }),
      expect.objectContaining({
        champion: "Zed",
        spell: "flash",
        confidence: "confirmed",
        readyAtSeconds: 450,
      }),
    ]);
  });

  it.each(["Quem nao tem flash?", "Quem não tem flash?"] as const)(
    "answers grouped negated flash query '%s' without registering Quem",
    (input) => {
      const memory = new TacticalMemory();
      memory.handleText("Ashe flashou", 100);

      const result = memory.handleText(input, 200);

      expect(result.ok).toBe(true);
      expect(result.kind).toBe("query");
      expect(result.message).toContain("Ashe flash volta em 03:20");
      expect(result.cooldowns).toEqual([
        expect.objectContaining({
          champion: "Ashe",
          spell: "flash",
          confidence: "confirmed",
          readyAtSeconds: 400,
        }),
      ]);
      expect(memory.listCooldowns(200)).toEqual([
        expect.objectContaining({
          champion: "Ashe",
          spell: "flash",
        }),
      ]);
    },
  );

  it("excludes expired cooldowns from grouped flash query", () => {
    const memory = new TacticalMemory();
    memory.handleText("Ashe flashou", 100);
    memory.handleText("Zed flashou", 500);

    const result = memory.handleText("Quem esta sem flash?", 550);

    expect(result.ok).toBe(true);
    expect(result.kind).toBe("query");
    expect(result.message).not.toContain("Ashe flash volta");
    expect(result.message).toContain("Zed flash volta em 04:10");
    expect(result.cooldowns).toEqual([
      expect.objectContaining({
        champion: "Zed",
        spell: "flash",
        confidence: "confirmed",
        readyAtSeconds: 800,
      }),
    ]);
  });

  it("answers none-active grouped flash query with exact message", () => {
    const memory = new TacticalMemory();

    const result = memory.handleText("Quem esta sem flash?", 200);

    expect(result.ok).toBe(true);
    expect(result.kind).toBe("query");
    expect(result.message).toBe("Ninguem sem flash na memoria ativa");
    expect(result.cooldowns).toEqual([]);
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

  it("clears stored facts on reset", () => {
    const memory = new TacticalMemory();
    memory.handleText("Zed sem sombra", 500);

    memory.reset();

    expect(memory.listFacts()).toEqual([]);
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
    pendingSnapshot = null;
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

  it("stores the current tactical plan after analyzing a snapshot", async () => {
    const analyzer = await import("../src/core/analyzer.js");
    const { Engine } = await import("../src/main/services/engine.js");
    const engine = new Engine();
    await engine.start();
    if ((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId) {
      clearInterval((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId as ReturnType<typeof setInterval>);
      (engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId = null;
    }

    expect(engine.engineState.currentTacticalPlan).toBeNull();
    vi.mocked(analyzer.analyzeSnapshot).mockResolvedValueOnce({
      triggers: [],
      strategicContext: {
        objectiveStates: [{ name: "dragon", spawnIn: "30 segundos", available: false }],
        enemyThreat: null,
        enemyThreats: [],
        alliedPower: 4,
        enemyPower: 4,
      },
    } as Awaited<ReturnType<typeof analyzer.analyzeSnapshot>>);

    currentSnapshot = makeSnapshot(300);
    await (engine as unknown as { tick: () => Promise<void> }).tick();

    expect(engine.engineState.currentTacticalPlan).toEqual(expect.objectContaining({
      intent: "prepare_objective",
      summary: expect.any(String),
      reasons: expect.any(Array),
    }));
    engine.stop();
  });

  it("emits an engine event after updating the current tactical plan on quiet ticks", async () => {
    const analyzer = await import("../src/core/analyzer.js");
    const { Engine } = await import("../src/main/services/engine.js");
    const engine = new Engine();
    const events: Array<{ type: string }> = [];
    engine.on("event", (event: { type: string }) => events.push(event));
    await engine.start();
    if ((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId) {
      clearInterval((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId as ReturnType<typeof setInterval>);
      (engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId = null;
    }

    vi.mocked(analyzer.analyzeSnapshot).mockResolvedValueOnce({
      triggers: [],
      strategicContext: {
        objectiveStates: [{ name: "dragon", spawnIn: "30 segundos", available: false }],
        enemyThreat: null,
        enemyThreats: [],
        alliedPower: 4,
        enemyPower: 4,
      },
    } as Awaited<ReturnType<typeof analyzer.analyzeSnapshot>>);

    currentSnapshot = makeSnapshot(300);
    events.length = 0;
    await (engine as unknown as { tick: () => Promise<void> }).tick();

    expect(events).toContainEqual(expect.objectContaining({ type: "state_update" }));
    engine.stop();
  });

  it("passes latest enemy snapshot context into tactical ultimate estimates", async () => {
    const { Engine } = await import("../src/main/services/engine.js");
    const engine = new Engine();
    await engine.start();
    if ((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId) {
      clearInterval((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId as ReturnType<typeof setInterval>);
      (engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId = null;
    }

    currentSnapshot = {
      ...makeSnapshot(300),
      enemyPlayers: [makeEnemyPlayer("Zed", 11, [{ id: 3158, name: "Ionian Boots of Lucidity" }])],
    };
    await (engine as unknown as { tick: () => Promise<void> }).tick();

    const result = engine.handleTacticalCommand("Zed sem ult");

    expect(result.cooldowns).toEqual([
      expect.objectContaining({
        champion: "Zed",
        baseCooldownSeconds: 100,
        adjustedCooldownSeconds: 91,
        readyAtSeconds: 391,
        notes: "Estimado com 10 ability haste.",
      }),
    ]);
    engine.stop();
  });

  it("handles enemy snapshot context without item arrays", async () => {
    const { Engine } = await import("../src/main/services/engine.js");
    const engine = new Engine();
    await engine.start();
    if ((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId) {
      clearInterval((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId as ReturnType<typeof setInterval>);
      (engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId = null;
    }

    currentSnapshot = {
      ...makeSnapshot(300),
      enemyPlayers: [{ championName: "Zed", level: 11 }],
    };
    await (engine as unknown as { tick: () => Promise<void> }).tick();

    expect(engine.handleTacticalCommand("Zed sem ult").cooldowns).toEqual([
      expect.objectContaining({
        champion: "Zed",
        baseCooldownSeconds: 100,
        adjustedCooldownSeconds: 100,
        readyAtSeconds: 400,
      }),
    ]);
    engine.stop();
  });

  it("clears latest tactical context when a game ends", async () => {
    const { Engine } = await import("../src/main/services/engine.js");
    const engine = new Engine();
    await engine.start();
    if ((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId) {
      clearInterval((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId as ReturnType<typeof setInterval>);
      (engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId = null;
    }

    currentSnapshot = {
      ...makeSnapshot(300),
      enemyPlayers: [makeEnemyPlayer("Zed", 11, [{ id: 3158, name: "Ionian Boots of Lucidity" }])],
    };
    await (engine as unknown as { tick: () => Promise<void> }).tick();
    currentSnapshot = null;
    await (engine as unknown as { tick: () => Promise<void> }).tick();

    const result = engine.handleTacticalCommand("Zed sem ult");

    expect(result.cooldowns).toEqual([
      expect.objectContaining({
        champion: "Zed",
        baseCooldownSeconds: 120,
        adjustedCooldownSeconds: 120,
        readyAtSeconds: 120,
      }),
    ]);
    engine.stop();
  });

  it("clears tactical memory and context when the engine stops", async () => {
    const { Engine } = await import("../src/main/services/engine.js");
    const engine = new Engine();
    await engine.start();
    if ((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId) {
      clearInterval((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId as ReturnType<typeof setInterval>);
      (engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId = null;
    }

    currentSnapshot = {
      ...makeSnapshot(300),
      enemyPlayers: [makeEnemyPlayer("Zed", 11, [{ id: 3158, name: "Ionian Boots of Lucidity" }])],
    };
    await (engine as unknown as { tick: () => Promise<void> }).tick();
    engine.handleTacticalCommand("Ashe flashou");

    engine.stop();

    expect(engine.listTacticalCooldowns()).toEqual([]);
    expect(engine.handleTacticalCommand("Zed sem ult").cooldowns).toEqual([
      expect.objectContaining({
        champion: "Zed",
        baseCooldownSeconds: 120,
        adjustedCooldownSeconds: 120,
        readyAtSeconds: 120,
      }),
    ]);
  });

  it("does not restore tactical context when an in-flight tick resolves after stop", async () => {
    const { Engine } = await import("../src/main/services/engine.js");
    const engine = new Engine();
    await engine.start();
    if ((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId) {
      clearInterval((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId as ReturnType<typeof setInterval>);
      (engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId = null;
    }

    let resolveSnapshot!: (snapshot: Record<string, unknown> | null) => void;
    pendingSnapshot = new Promise((resolve) => {
      resolveSnapshot = resolve;
    });
    const tickPromise = (engine as unknown as { tick: () => Promise<void> }).tick();

    engine.stop();
    resolveSnapshot({
      ...makeSnapshot(300),
      enemyPlayers: [makeEnemyPlayer("Zed", 11, [{ id: 3158, name: "Ionian Boots of Lucidity" }])],
    });
    await tickPromise;
    pendingSnapshot = null;

    expect(engine.engineState.gameDetected).toBe(false);
    expect(engine.engineState.gameTime).toBe(0);
    expect(engine.listTacticalCooldowns()).toEqual([]);
    expect(engine.handleTacticalCommand("Zed sem ult").cooldowns).toEqual([
      expect.objectContaining({
        champion: "Zed",
        baseCooldownSeconds: 120,
        adjustedCooldownSeconds: 120,
        readyAtSeconds: 120,
      }),
    ]);
  });

  it("does not restore tactical context when stop happens after snapshot logging begins", async () => {
    const { Engine } = await import("../src/main/services/engine.js");
    const engine = new Engine();
    const events: Array<{ type: string }> = [];
    engine.on("event", (event: { type: string }) => events.push(event));
    await engine.start();
    if ((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId) {
      clearInterval((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId as ReturnType<typeof setInterval>);
      (engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId = null;
    }

    let resolveNewSession!: () => void;
    logger.newSession.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveNewSession = () => resolve({});
      }),
    );
    (engine as unknown as { state: { hasLoggedWaitingState: boolean } }).state.hasLoggedWaitingState = true;
    currentSnapshot = {
      ...makeSnapshot(300),
      enemyPlayers: [makeEnemyPlayer("Zed", 11, [{ id: 3158, name: "Ionian Boots of Lucidity" }])],
    };
    const tickPromise = (engine as unknown as { tick: () => Promise<void> }).tick();
    while (logger.newSession.mock.calls.length === 0) {
      await Promise.resolve();
    }

    engine.stop();
    resolveNewSession();
    await tickPromise;

    expect(engine.engineState.gameDetected).toBe(false);
    expect(events.some((event) => event.type === "game_detected")).toBe(false);
    expect(engine.engineState.gameTime).toBe(0);
    expect(engine.listTacticalCooldowns()).toEqual([]);
    expect(engine.handleTacticalCommand("Zed sem ult").cooldowns).toEqual([
      expect.objectContaining({
        champion: "Zed",
        baseCooldownSeconds: 120,
        adjustedCooldownSeconds: 120,
        readyAtSeconds: 120,
      }),
    ]);
  });

  it("does not log coach decisions when stop happens during analysis", async () => {
    const analyzer = await import("../src/core/analyzer.js");
    const { Engine } = await import("../src/main/services/engine.js");
    const engine = new Engine();
    await engine.start();
    if ((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId) {
      clearInterval((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId as ReturnType<typeof setInterval>);
      (engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId = null;
    }

    let resolveAnalyze!: (result: unknown) => void;
    vi.mocked(analyzer.analyzeSnapshot).mockClear();
    vi.mocked(analyzer.analyzeSnapshot).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveAnalyze = resolve;
      }) as ReturnType<typeof analyzer.analyzeSnapshot>,
    );
    currentSnapshot = makeSnapshot(300);
    const tickPromise = (engine as unknown as { tick: () => Promise<void> }).tick();
    for (let i = 0; i < 10 && vi.mocked(analyzer.analyzeSnapshot).mock.calls.length === 0; i++) {
      await Promise.resolve();
    }
    expect(vi.mocked(analyzer.analyzeSnapshot).mock.calls.length).toBeGreaterThan(0);

    logger.log.mockClear();
    engine.stop();
    resolveAnalyze({ triggers: [], strategicContext: { objectiveStates: [] } });
    await tickPromise;

    expect(logger.log).not.toHaveBeenCalledWith("coach_decision", expect.anything());
  });

  it("does not log coach decisions when stop happens during coach decision", async () => {
    const coach = await import("../src/core/coach.js");
    const { Engine } = await import("../src/main/services/engine.js");
    const engine = new Engine();
    await engine.start();
    if ((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId) {
      clearInterval((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId as ReturnType<typeof setInterval>);
      (engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId = null;
    }

    let resolveDecision!: (result: unknown) => void;
    vi.mocked(coach.decideCoaching).mockClear();
    vi.mocked(coach.decideCoaching).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveDecision = resolve;
      }) as ReturnType<typeof coach.decideCoaching>,
    );
    currentSnapshot = makeSnapshot(300);
    const tickPromise = (engine as unknown as { tick: () => Promise<void> }).tick();
    for (let i = 0; i < 10 && vi.mocked(coach.decideCoaching).mock.calls.length === 0; i++) {
      await Promise.resolve();
    }
    expect(vi.mocked(coach.decideCoaching).mock.calls.length).toBeGreaterThan(0);

    logger.log.mockClear();
    engine.stop();
    resolveDecision({
      shouldSpeak: false,
      message: "",
      reason: "stopped",
      priority: null,
      prompt: "",
      rawModelMessage: "",
      fallbackUsed: false,
      llmMs: 0,
      llmError: null,
      skippedLlm: true,
    });
    await tickPromise;

    expect(logger.log).not.toHaveBeenCalledWith("coach_decision", expect.anything());
  });

  it("does not publish coach errors when stop happens during coach decision rejection", async () => {
    const coach = await import("../src/core/coach.js");
    const { Engine } = await import("../src/main/services/engine.js");
    const engine = new Engine();
    await engine.start();
    if ((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId) {
      clearInterval((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId as ReturnType<typeof setInterval>);
      (engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId = null;
    }

    let rejectDecision!: (error: Error) => void;
    vi.mocked(coach.decideCoaching).mockClear();
    vi.mocked(coach.decideCoaching).mockImplementationOnce(
      () => new Promise((_, reject) => {
        rejectDecision = reject;
      }) as ReturnType<typeof coach.decideCoaching>,
    );
    currentSnapshot = makeSnapshot(300);
    const tickPromise = (engine as unknown as { tick: () => Promise<void> }).tick();
    for (let i = 0; i < 10 && vi.mocked(coach.decideCoaching).mock.calls.length === 0; i++) {
      await Promise.resolve();
    }
    expect(vi.mocked(coach.decideCoaching).mock.calls.length).toBeGreaterThan(0);

    logger.log.mockClear();
    engine.stop();
    rejectDecision(new Error("stopped decision"));
    await tickPromise;

    expect(engine.engineState.llmStatus).not.toBe("error");
    expect(logger.log).not.toHaveBeenCalledWith("coach_error", expect.anything());
  });

  it("does not publish spoken messages when stop happens during TTS", async () => {
    const coach = await import("../src/core/coach.js");
    const voice = await import("../src/core/voice.js");
    const { Engine } = await import("../src/main/services/engine.js");
    const engine = new Engine();
    await engine.start();
    if ((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId) {
      clearInterval((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId as ReturnType<typeof setInterval>);
      (engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId = null;
    }

    vi.mocked(coach.decideCoaching).mockClear();
    vi.mocked(coach.decideCoaching).mockResolvedValueOnce({
      shouldSpeak: true,
      message: "Pare a luta agora.",
      reason: "test",
      priority: "perigo",
      prompt: "",
      rawModelMessage: "",
      fallbackUsed: false,
      llmMs: 0,
      llmError: null,
      skippedLlm: true,
    });
    let resolveSpeak!: (result: unknown) => void;
    vi.mocked(voice.speak).mockClear();
    vi.mocked(voice.speak).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveSpeak = resolve;
      }) as ReturnType<typeof voice.speak>,
    );
    currentSnapshot = makeSnapshot(300);
    const tickPromise = (engine as unknown as { tick: () => Promise<void> }).tick();
    for (let i = 0; i < 10 && vi.mocked(voice.speak).mock.calls.length === 0; i++) {
      await Promise.resolve();
    }
    expect(vi.mocked(voice.speak).mock.calls.length).toBeGreaterThan(0);

    engine.stop();
    resolveSpeak({ generateMs: 0, provider: "mock" });
    await tickPromise;

    expect(engine.engineState.lastMessage).toBe("");
    expect(logger.log).not.toHaveBeenCalledWith("coach_speak", expect.anything());
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

  it("does not emit game ended when stop happens during game-ended logging", async () => {
    const { Engine } = await import("../src/main/services/engine.js");
    const engine = new Engine();
    const events: Array<{ type: string }> = [];
    engine.on("event", (event: { type: string }) => events.push(event));
    await engine.start();
    if ((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId) {
      clearInterval((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId as ReturnType<typeof setInterval>);
      (engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId = null;
    }

    currentSnapshot = makeSnapshot(120);
    await (engine as unknown as { tick: () => Promise<void> }).tick();
    events.length = 0;

    let resolveGameEnded!: () => void;
    logger.log.mockClear();
    logger.log.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveGameEnded = () => resolve(undefined);
      }),
    );
    currentSnapshot = null;
    const tickPromise = (engine as unknown as { tick: () => Promise<void> }).tick();
    for (let i = 0; i < 10 && logger.log.mock.calls.length === 0; i++) {
      await Promise.resolve();
    }
    expect(logger.log).toHaveBeenCalledWith("game_ended", expect.anything());

    engine.stop();
    resolveGameEnded();
    await tickPromise;

    expect(events.some((event) => event.type === "game_ended")).toBe(false);
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
    expect(source).toContain("Confirmados");
    expect(source).toContain("Estimados");
    expect(source).toContain("Prontos");
    expect(source).toContain("Outros");
    expect(source).toContain('confidence === "unknown"');
    expect(source).toContain("key={cooldown.id}");
  });
});
