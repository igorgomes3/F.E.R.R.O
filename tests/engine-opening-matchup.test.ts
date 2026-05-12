import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let storeData: Record<string, unknown> = {};
let currentSnapshot: Record<string, unknown> | null = null;
let matchupCallCount = 0;
const speakCalls: string[] = [];

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
  getMatchupTip: vi.fn(async () => {
    matchupCallCount += 1;
    return { message: "Respeita o poke e pune a skill chave.", llmMs: 123 };
  }),
}));

vi.mock("../src/core/game.js", () => ({
  getSnapshot: vi.fn(async () => currentSnapshot),
}));

vi.mock("../src/core/voice.js", () => ({
  speak: vi.fn(async (text: string) => {
    speakCalls.push(text);
    return { generateMs: 12, provider: "mock" };
  }),
}));

vi.mock("../src/core/logger.js", () => ({
  createLogger: vi.fn(async () => logger),
}));

vi.mock("../src/core/state.js", () => {
  class MockLoopState {
    lastCoachingAt = 0;
    lastGameTime: number | null = null;
    hasLoggedWaitingState = false;
    matchupDone = false;
    openingGreetingDone = false;
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

    markMessageSpoken() {}

    detectGameReset(currentGameTime: number) {
      return this.lastGameTime !== null && currentGameTime < this.lastGameTime - 10;
    }

    reset() {
      this.lastCoachingAt = 0;
      this.lastGameTime = null;
      this.hasLoggedWaitingState = false;
      this.matchupDone = false;
      this.openingGreetingDone = false;
      this.pendingTriggers = [];
    }
  }

  return { LoopState: MockLoopState };
});

vi.mock("../src/core/config.js", () => ({
  settings: coreSettings,
}));

vi.mock("../src/core/constants.js", () => ({
  pickModePhrase: vi.fn(() => "Beleza, comecou a partida! Bora jogar."),
}));

function makeSnapshot(gameTime: number) {
  return {
    gameTime,
    activePlayerName: "player",
    activePlayerChampion: "Ahri",
    activePlayerLevel: 1,
    activePlayerGold: 0,
    activePlayerKda: "0/0/0",
    alliedPlayers: [],
    enemyPlayers: [{ championName: "Lux" }],
  };
}

describe("engine opening matchup timing", () => {
  beforeEach(() => {
    vi.resetModules();
    storeData = {};
    currentSnapshot = null;
    matchupCallCount = 0;
    speakCalls.length = 0;
    logger.log.mockClear();
    logger.logGame.mockClear();
    logger.newSession.mockClear();
  });

  afterEach(async () => {
    const { engine } = await import("../src/main/services/engine.js");
    engine.stop();
  });

  it("keeps the greeting at the start and delays matchup LLM until around 0:50", async () => {
    const configService = await import("../src/main/services/config-service.js");
    configService.initConfigStore();
    configService.setPath("llm.activeProvider", "zai");
    configService.setPath("llm.providers.zai.apiKey", "test-key");
    configService.setPath("llm.providers.zai.model", "glm-5");

    const { engine } = await import("../src/main/services/engine.js");
    await engine.start();

    if ((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId) {
      clearInterval((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId as ReturnType<typeof setInterval>);
      (engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId = null;
    }

    currentSnapshot = makeSnapshot(10);
    await (engine as unknown as { tick: () => Promise<void> }).tick();

    expect(speakCalls).toEqual(["Beleza, comecou a partida! Bora jogar."]);
    expect(matchupCallCount).toBe(0);

    currentSnapshot = makeSnapshot(55);
    await (engine as unknown as { tick: () => Promise<void> }).tick();

    expect(matchupCallCount).toBe(1);
    expect(speakCalls).toEqual([
      "Beleza, comecou a partida! Bora jogar.",
      "Respeita o poke e pune a skill chave.",
    ]);

    currentSnapshot = makeSnapshot(80);
    await (engine as unknown as { tick: () => Promise<void> }).tick();

    expect(matchupCallCount).toBe(1);
  });

  it("does not publish opening greeting when stop happens during greeting TTS", async () => {
    const voice = await import("../src/core/voice.js");
    const { engine } = await import("../src/main/services/engine.js");
    await engine.start();

    if ((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId) {
      clearInterval((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId as ReturnType<typeof setInterval>);
      (engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId = null;
    }

    let resolveSpeak!: () => void;
    vi.mocked(voice.speak).mockClear();
    vi.mocked(voice.speak).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveSpeak = () => resolve({ generateMs: 12, provider: "mock" });
      }) as ReturnType<typeof voice.speak>,
    );
    currentSnapshot = makeSnapshot(10);
    const tickPromise = (engine as unknown as { tick: () => Promise<void> }).tick();
    for (let i = 0; i < 10 && vi.mocked(voice.speak).mock.calls.length === 0; i++) {
      await Promise.resolve();
    }
    expect(vi.mocked(voice.speak).mock.calls.length).toBeGreaterThan(0);

    engine.stop();
    resolveSpeak();
    await tickPromise;

    expect(engine.engineState.lastMessage).toBe("");
    expect(logger.log).not.toHaveBeenCalledWith("coach_speak", expect.anything());
  });

  it("does not start matchup TTS when stop happens during matchup lookup", async () => {
    const coach = await import("../src/core/coach.js");
    const voice = await import("../src/core/voice.js");
    const configService = await import("../src/main/services/config-service.js");
    configService.initConfigStore();
    configService.setPath("llm.activeProvider", "zai");
    configService.setPath("llm.providers.zai.apiKey", "test-key");
    configService.setPath("llm.providers.zai.model", "glm-5");
    const { engine } = await import("../src/main/services/engine.js");
    await engine.start();

    if ((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId) {
      clearInterval((engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId as ReturnType<typeof setInterval>);
      (engine as unknown as { intervalId: ReturnType<typeof setInterval> | null }).intervalId = null;
    }

    currentSnapshot = makeSnapshot(10);
    await (engine as unknown as { tick: () => Promise<void> }).tick();
    speakCalls.length = 0;

    let resolveMatchup!: () => void;
    vi.mocked(coach.getMatchupTip).mockClear();
    vi.mocked(coach.getMatchupTip).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveMatchup = () => resolve({ message: "Respeita o poke e pune a skill chave.", llmMs: 123 });
      }) as ReturnType<typeof coach.getMatchupTip>,
    );
    vi.mocked(voice.speak).mockClear();
    currentSnapshot = makeSnapshot(55);
    const tickPromise = (engine as unknown as { tick: () => Promise<void> }).tick();
    for (let i = 0; i < 10 && vi.mocked(coach.getMatchupTip).mock.calls.length === 0; i++) {
      await Promise.resolve();
    }
    expect(vi.mocked(coach.getMatchupTip).mock.calls.length).toBeGreaterThan(0);

    engine.stop();
    resolveMatchup();
    await tickPromise;

    expect(vi.mocked(voice.speak)).not.toHaveBeenCalledWith("Respeita o poke e pune a skill chave.");
    expect(speakCalls).toEqual([]);
  });
});
