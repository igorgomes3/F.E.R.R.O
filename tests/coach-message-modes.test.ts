import { beforeEach, describe, expect, it, vi } from "vitest";

let lastRequestBody: Record<string, unknown> | null = null;

vi.mock("dotenv/config", () => ({}));

vi.mock("openai", () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn(async (requestBody: Record<string, unknown>) => {
          lastRequestBody = requestBody;
          return {
            choices: [{ message: { content: "Joga no alcance. Bate quando a skill chave sair." } }],
            usage: null,
          };
        }),
      },
    };
  }

  return { default: MockOpenAI };
});

describe("coach message modes", () => {
  beforeEach(() => {
    vi.resetModules();
    lastRequestBody = null;
    delete process.env.ZAI_API_KEY;
    delete process.env.ZAI_ENDPOINT;
    delete process.env.ZAI_MODEL;
    delete process.env.COACH_MESSAGE_MODE;
  });

  it("uses mode-specific heuristic fallback when LLM is disabled", async () => {
    const configMod = await import("../src/core/config.js");
    const coachMod = await import("../src/core/coach.js");

    configMod.settings.zaiApiKey = "";
    configMod.settings.zaiEndpoint = "https://api.example/v1/chat/completions";
    configMod.settings.zaiModel = "glm-5";
    configMod.settings.coachMessageMode = "puto";

    const result = await coachMod.decideCoaching(
      { activePlayerGold: 0, enemyPlayers: [] },
      ["inimigo counter antiCura"],
      { objectiveStates: [] }
    );

    expect(result.message).toBe("Compraram anti-cura. Você vai curar porra nenhuma.");
    expect(result.skippedLlm).toBe(true);
  });

  it("builds matchup prompt with the selected mode style", async () => {
    const configMod = await import("../src/core/config.js");
    const coachMod = await import("../src/core/coach.js");

    configMod.settings.zaiApiKey = "test-key";
    configMod.settings.zaiEndpoint = "https://api.example/v1/chat/completions";
    configMod.settings.zaiModel = "glm-5";
    configMod.settings.coachMessageMode = "meme";

    await coachMod.getMatchupTip({
      activePlayerChampion: "Ahri",
      enemyPlayers: [{ championName: "Lux" }],
    });

    const messages = (lastRequestBody?.messages ?? []) as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("Tom brincalhão");
  });

  it("fallback for 10-second timers uses 'está para nascer'", async () => {
    const configMod = await import("../src/core/config.js");
    const coachMod = await import("../src/core/coach.js");
    configMod.settings.zaiApiKey = "";
    configMod.settings.zaiEndpoint = "https://api.example/v1/chat/completions";
    configMod.settings.zaiModel = "glm-5";
    configMod.settings.coachMessageMode = "serio";

    const dragon = await coachMod.decideCoaching(
      { activePlayerGold: 0, enemyPlayers: [] },
      ["dragão em 10 segundos"],
      { objectiveStates: [] }
    );
    expect(dragon.message).toBe("Dragão está para nascer.");

    const grubs = await coachMod.decideCoaching(
      { activePlayerGold: 0, enemyPlayers: [] },
      ["vastilarvas em 10 segundos"],
      { objectiveStates: [] }
    );
    expect(grubs.message).toBe("Vastilarvas estão para nascer.");
  });

  it("does not turn tower warnings into death warnings", async () => {
    const configMod = await import("../src/core/config.js");
    const coachMod = await import("../src/core/coach.js");

    configMod.settings.zaiApiKey = "";
    configMod.settings.zaiEndpoint = "https://api.example/v1/chat/completions";
    configMod.settings.zaiModel = "glm-5";
    configMod.settings.coachMessageMode = "serio";

    const result = await coachMod.decideCoaching(
      { activePlayerGold: 0, enemyPlayers: [] },
      ["Perdemos torre do mid. Toma cuidado com rotas inimigas."],
      { objectiveStates: [] }
    );

    expect(result.message).toBe("Perdemos torre do mid. Toma cuidado com rotas inimigas.");
    expect(String(result.message)).not.toContain("Cuidado com Perdemos torre");
  });

  it("includes tactical plan context in coaching prompt", async () => {
    const configMod = await import("../src/core/config.js");
    const coachMod = await import("../src/core/coach.js");

    configMod.settings.zaiApiKey = "test-key";
    configMod.settings.zaiEndpoint = "https://api.example/v1/chat/completions";
    configMod.settings.zaiModel = "glm-5";
    configMod.settings.coachMessageMode = "serio";

    const result = await coachMod.decideCoaching(
      { activePlayerGold: 0, enemyPlayers: [], alliedPlayers: [] },
      ["torre caiu no bot"],
      {
        objectiveStates: [],
        tacticalPlan: {
          intent: "prepare_objective",
          priority: "high",
          confidence: "confirmed",
          summary: "Prepara dragão",
          reasons: [
            { kind: "objective", text: "Dragão nasce em 45s", confidence: "confirmed", weight: 10 },
          ],
          createdAtGameTimeSeconds: 300,
        },
      }
    );

    expect(result.prompt).toContain("Plano tatico atual");
    expect(result.prompt).toContain("prepare_objective");
    expect(result.prompt).toContain("Prepara dragão");
  });

  it("does not use fallback-only tactical plan as strategic context", async () => {
    const configMod = await import("../src/core/config.js");
    const coachMod = await import("../src/core/coach.js");

    configMod.settings.zaiApiKey = "test-key";
    configMod.settings.zaiEndpoint = "https://api.example/v1/chat/completions";
    configMod.settings.zaiModel = "glm-5";
    configMod.settings.coachMessageMode = "serio";

    const result = await coachMod.decideCoaching(
      { activePlayerGold: 0, enemyPlayers: [], alliedPlayers: [] },
      [],
      {
        objectiveStates: [],
        tacticalPlan: {
          intent: "farm_safe",
          priority: "low",
          confidence: "unknown",
          summary: "Farma seguro ate aparecer uma janela melhor.",
          reasons: [
            { kind: "fallback", text: "Sem sinal tatico forte", confidence: "unknown", weight: 1 },
          ],
          createdAtGameTimeSeconds: 300,
        },
      }
    );

    expect(result.skippedLlm).toBe(true);
    expect(result.reason).toBe("sem contexto estratégico para LLM");
    expect(result.prompt).toBe("");
  });

  it("does not include fallback-only tactical plan in prompt when other context triggers LLM", async () => {
    const configMod = await import("../src/core/config.js");
    const coachMod = await import("../src/core/coach.js");

    configMod.settings.zaiApiKey = "test-key";
    configMod.settings.zaiEndpoint = "https://api.example/v1/chat/completions";
    configMod.settings.zaiModel = "glm-5";
    configMod.settings.coachMessageMode = "serio";

    const result = await coachMod.decideCoaching(
      { activePlayerGold: 0, enemyPlayers: [], alliedPlayers: [] },
      ["torre caiu no bot"],
      {
        objectiveStates: [],
        tacticalPlan: {
          intent: "farm_safe",
          priority: "low",
          confidence: "unknown",
          summary: "Farma seguro ate aparecer uma janela melhor.",
          reasons: [
            { kind: "fallback", text: "Sem sinal tatico forte", confidence: "unknown", weight: 1 },
          ],
          createdAtGameTimeSeconds: 300,
        },
      }
    );

    expect(result.skippedLlm).toBe(false);
    expect(result.prompt).not.toContain("Plano tatico atual");
    expect(result.prompt).not.toContain("Farma seguro ate aparecer uma janela melhor.");
    expect(result.prompt).not.toContain("Intent: farm_safe");
  });

  it("system prompt includes anti-generic rules", async () => {
    const { buildSystemPrompt } = await import("../src/core/constants.js");
    const prompt = buildSystemPrompt("serio");
    expect(prompt).toContain("Sempre mencione pelo menos um campeão");
    expect(prompt).toContain("NUNCA dê conselhos genéricos");
  });

  it("system prompt allows objective calls from deterministic tactical plans", async () => {
    const { buildSystemPrompt } = await import("../src/core/constants.js");
    const prompt = buildSystemPrompt("serio");
    expect(prompt).toContain("Só mencione dragão/barão/arauto se estiver 'disponível' nos Objetivos ou se o Plano tatico atual pedir prepare_objective/trade_objective");
  });

  it("matchup prompt includes lane opponent rules", async () => {
    const { buildMatchupPrompt } = await import("../src/core/constants.js");
    const prompt = buildMatchupPrompt("serio");
    expect(prompt).toContain("adversário direto");
  });

  it("no template produces preposition + {pronoun} without a noun", async () => {
    const { MESSAGE_MODE_PROFILES } = await import("../src/core/constants.js");
    const badPatterns = [/com \{pronoun\}/, /pra \{pronoun\}/, /contra \{pronoun\}/];
    for (const [mode, profile] of Object.entries(MESSAGE_MODE_PROFILES)) {
      for (const [key, phrases] of Object.entries(profile.phrases)) {
        for (const phrase of phrases as string[]) {
          for (const pattern of badPatterns) {
            expect(phrase, `${mode}/${key}: "${phrase}"`).not.toMatch(pattern);
          }
        }
      }
    }
  });
});

describe("new event categories", () => {
  beforeEach(() => { vi.resetModules(); });

  it("detectCategory recognizes all new trigger types", async () => {
    const { detectCategory } = await import("../src/core/coach.js");
    expect(detectCategory("ace inimigo")).toBe("ace");
    expect(detectCategory("ace aliado")).toBe("ace");
    expect(detectCategory("multikill inimigo: Shyvana:double kill")).toBe("multikill");
    expect(detectCategory("multikill aliado: Xerath:triple kill")).toBe("multikill");
    expect(detectCategory("roubaram dragão")).toBe("objetivoRoubo");
    expect(detectCategory("roubamos barão")).toBe("objetivoRoubo");
    expect(detectCategory("first blood aliado")).toBe("firstBlood");
    expect(detectCategory("first blood inimigo")).toBe("firstBlood");
    expect(detectCategory("inibidor inimigo voltou")).toBe("inibidorRespawn");
    expect(detectCategory("alma do dragão aliada: falta 1")).toBe("dragonSoul");
    expect(detectCategory("alma do dragão inimiga: falta 2")).toBe("dragonSoul");
    expect(detectCategory("cs alerta")).toBe("csAlerta");
    expect(detectCategory("ward alerta")).toBe("wardAlerta");
  });

  it("fallback message for ace inimigo produces non-empty text", async () => {
    const configMod = await import("../src/core/config.js");
    const coachMod = await import("../src/core/coach.js");
    configMod.settings.zaiApiKey = "";
    configMod.settings.coachMessageMode = "serio";
    const result = await coachMod.decideCoaching(
      { activePlayerGold: 0, enemyPlayers: [] },
      ["ace inimigo"], { objectiveStates: [] }
    );
    expect(result.message).toBeTruthy();
    expect(result.message.length).toBeGreaterThan(5);
  });
});

describe("jungle triggers", () => {
  beforeEach(() => { vi.resetModules(); });

  it("detectCategory recognizes jungle triggers", async () => {
    const { detectCategory } = await import("../src/core/coach.js");
    expect(detectCategory("gank oportunidade: bot vulnerável, Draven morreu")).toBe("jungleGank");
    expect(detectCategory("lane precisa de ajuda: top")).toBe("junglePressao");
  });

  it("jungle gank trigger produces a phrase with lane", async () => {
    const configMod = await import("../src/core/config.js");
    const coachMod = await import("../src/core/coach.js");
    configMod.settings.zaiApiKey = "";
    configMod.settings.coachMessageMode = "serio";

    const result = await coachMod.decideCoaching(
      { activePlayerGold: 0, enemyPlayers: [], activePlayerPosition: "JUNGLE" },
      ["gank oportunidade: bot vulnerável, Draven morreu"],
      { objectiveStates: [] }
    );
    expect(result.skippedLlm).toBe(true);
    expect(result.message).toBeTruthy();
    expect(result.message).toContain("bot");
  });

  it("jungle pressure trigger produces a phrase with lane", async () => {
    const configMod = await import("../src/core/config.js");
    const coachMod = await import("../src/core/coach.js");
    configMod.settings.zaiApiKey = "";
    configMod.settings.coachMessageMode = "serio";

    const result = await coachMod.decideCoaching(
      { activePlayerGold: 0, enemyPlayers: [], activePlayerPosition: "JUNGLE" },
      ["lane precisa de ajuda: top"],
      { objectiveStates: [] }
    );
    expect(result.skippedLlm).toBe(true);
    expect(result.message).toBeTruthy();
    expect(result.message).toContain("top");
  });
});
