import { settings } from "./config";
import {
  CATEGORY_COOLDOWNS,
  FEMALE_CHAMPIONS,
  buildMatchupPrompt,
  buildSystemPrompt,
  pickModePhrase
} from "./constants";
import { createTextResponse } from "./llm-client";
import type { CoachDecision, GameSnapshot, MatchupTip, SnapshotPlayer, StrategicContext } from "./types";

function hasLlmConfig(): boolean {
  return Boolean(settings.zaiApiKey && settings.zaiEndpoint && settings.zaiModel);
}

// ── helpers ──────────────────────────────────────────────────────

function genderPronoun(championName: string): string {
  return FEMALE_CHAMPIONS.has(championName) ? "dela" : "dele";
}

function toSentence(text: string): string {
  if (!text) return "";
  const t = text.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const DANGLING_ENDINGS = /\s+(para|no|na|de|do|dos|das|em|o|a|os|as|e|ou|um|uma|com|por|ao|à|que|se|seu|sua|seus|suas|pelo|pela|nos|nas|num)$/i;

function isTruncated(text: string): boolean {
  if (!text) return false;
  const t = text.trim();
  return t.length < 5 || DANGLING_ENDINGS.test(t);
}

// ── trigger classification ───────────────────────────────────────

const SIMPLE_TRIGGERS = new Set(["lembrete de mapa", "ouro parado alto"]);

function isSimpleTrigger(priority: string | null): boolean {
  if (!priority) return false;
  if (SIMPLE_TRIGGERS.has(priority)) return true;
  // Time-sensitive alerts — must be immediate, no LLM latency
  if (priority.includes("em 1 minuto")) return true;
  if (priority.includes("em 30 segundos")) return true;
  if (priority.includes("em 10 segundos")) return true;
  if (priority.includes("nasceu agora")) return true;
  if (priority.startsWith("inimigo morreu:")) return true;
  if (priority.includes("você morreu")) return true;
  if (priority.includes("cuidado com")) return true;
  if (priority === "vitória" || priority === "derrota") return true;
  if (priority === "ult disponível") return true;
  if (priority.startsWith("inimigo ult antes:")) return true;
  if (priority.startsWith("level up chave:")) return true;
  if (priority.startsWith("item fechado:")) return true;
  if (priority.startsWith("inimigo counter")) return true;
  if (priority.startsWith("inimigo fed:")) return true;
  // Strategic triggers go to LLM for contextual advice:
  // torre, acelerou a build, powerspike, inibidor,
  // inimigo item, gank oportunidade, lane precisa de ajuda
  // New events — these are reactive, use heuristic
  if (priority === "ace inimigo" || priority.startsWith("ace inimigo:") || priority === "ace aliado") return true;
  if (priority.startsWith("multikill ")) return true;
  if (priority.startsWith("roubaram ") || priority.startsWith("roubamos ")) return true;
  if (priority.startsWith("first blood")) return true;
  if (priority === "inibidor inimigo voltou") return true;
  if (priority === "cs alerta") return true;
  if (priority === "ward alerta") return true;
  if (priority.startsWith("dragão tipo ")) return true;
  if (priority.startsWith("lane ouro")) return true;
  return false;
}

// ── category detection ───────────────────────────────────────────

export function detectCategory(priority: string | null): string {
  if (!priority) return "generico";
  if (priority === "lembrete de mapa") return "mapa";
  if (priority === "ouro parado alto") return "ouroParado";
  if (priority.startsWith("inimigo fed:")) return "inimigoFed";
  if (priority.includes("acelerou a build")) return "inimigoBuild";
  if (priority.includes("powerspike")) return "powerspike";
  if (priority.includes("Perdemos torre") || priority.includes("perdemos torre") ||
      priority.includes("Torre aliada") || priority.includes("nossa torre")) return "torrePerdida";
  if (priority.includes("torre") || priority.includes("caiu torre")) return "torre";
  if (priority.startsWith("inimigo morreu:")) return "inimigoMorreu";
  if (priority.includes("você morreu")) return "morteStreak";
  if (priority.includes("cuidado com")) return "morteJogador";
  if (priority === "ult disponível" || priority.startsWith("inimigo ult antes:") ||
      priority.startsWith("level up chave:")) return "levelUp";
  if (priority.startsWith("item fechado:")) return "itemFechado";
  if (priority.startsWith("inimigo item:") || priority.startsWith("inimigo counter")) return "inimigoItem";
  if (priority === "inibidor inimigo voltou") return "inibidorRespawn";
  if (priority.includes("inibidor")) return "inibidor";
  if (priority.startsWith("gank oportunidade:")) return "jungleGank";
  if (priority.startsWith("lane precisa de ajuda:")) return "junglePressao";
  if (priority.startsWith("gank timing:")) return "jungleTiming";
  if (priority === "vitória" || priority === "derrota") return "fimDeJogo";
  if (priority.includes("em 1 minuto") || priority.includes("em 30 segundos") ||
      priority.includes("em 10 segundos") || priority.includes("nasceu agora")) return "objetivo";
  if (priority === "ace aliado" || priority === "ace inimigo" || priority.startsWith("ace inimigo:")) return "ace";
  if (priority.startsWith("multikill ")) return "multikill";
  if (priority.startsWith("roubaram ") || priority.startsWith("roubamos ")) return "objetivoRoubo";
  if (priority.startsWith("first blood")) return "firstBlood";
  if (priority.startsWith("alma do dragão ")) return "dragonSoul";
  if (priority === "cs alerta") return "csAlerta";
  if (priority === "ward alerta") return "wardAlerta";
  if (priority.startsWith("dragão tipo aliado:")) return "dragonTipo";
  if (priority.startsWith("dragão tipo inimigo:")) return "dragonTipoInimigo";
  if (priority.startsWith("lane ouro")) return "laneOuro";
  return "generico";
}

export function getCategoryCooldown(category: string): number {
  return CATEGORY_COOLDOWNS[category] ?? CATEGORY_COOLDOWNS.generico;
}

// ── heuristic / fallback ─────────────────────────────────────────

function heuristicAlert(snapshot: GameSnapshot, triggers: string[]): string | null {
  if (triggers.length > 0) return triggers[0];

  if (snapshot.activePlayerGold >= settings.stalledGoldThreshold) {
    return "ouro parado alto";
  }

  const fedEnemies = [...snapshot.enemyPlayers]
    .filter((p) => p.kills >= 4 && p.kills - p.deaths >= 2)
    .sort((a, b) => (b.kills - b.deaths) - (a.kills - a.deaths));

  if (fedEnemies.length > 0) {
    return `inimigo fed: ${fedEnemies[0].championName}`;
  }

  return null;
}

function fallbackMessage(priority: string | null): string {
  if (!priority) return "";

  if (priority.includes("em 10 segundos")) {
    const name = priority.replace(" em 10 segundos", "").trim();
    const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
    const verb = name === "vastilarvas" ? "estão" : "está";
    return `${capitalized} ${verb} para nascer.`;
  }

  if (priority === "lembrete de mapa") {
    return pickModePhrase("mapa");
  }

  if (priority === "ouro parado alto") {
    return pickModePhrase("ouroParado");
  }

  if (priority.startsWith("inimigo fed:")) {
    const name = priority.split(":")[1]?.trim();
    if (!name) return "";
    const pronoun = genderPronoun(name);
    const template = pickModePhrase("inimigoFed");
    return template.replace(/\{name\}/g, name).replace(/\{pronoun\}/g, pronoun);
  }

  if (priority.includes("acelerou a build")) {
    const name = priority.split(" acelerou")[0]?.trim();
    if (name) {
      const pronoun = genderPronoun(name);
      const template = pickModePhrase("inimigoBuild");
      return template.replace(/\{name\}/g, name).replace(/\{pronoun\}/g, pronoun);
    }
  }

  if (priority.includes("powerspike")) {
    const match = priority.match(/(\d+ (?:itens|item))/);
    const count = match ? match[1] : "itens";
    return pickModePhrase("powerspike").replace("{count}", count);
  }

  if (priority.startsWith("inimigo morreu:")) {
    const name = priority.split(":")[1]?.trim();
    if (name) return pickModePhrase("inimigoMorreu").replace(/\{name\}/g, name);
  }

  if (priority.includes("você morreu")) {
    const match = priority.match(/(\d+) vezes/);
    const count = match ? match[1] : "";
    return pickModePhrase("morteStreak").replace("{count}", count);
  }

  if (priority.startsWith("cuidado com ")) {
    const name = priority.replace("cuidado com ", "").split(",")[0].trim();
    return pickModePhrase("morteJogador").replace(/\{name\}/g, name);
  }

  if (priority === "ult disponível") {
    return pickModePhrase("ultDisponivel");
  }

  if (priority.startsWith("inimigo ult antes:")) {
    const name = priority.split(":")[1]?.trim();
    if (name) return pickModePhrase("inimigoUltAntes").replace(/\{name\}/g, name);
  }

  if (priority.startsWith("level up chave:")) {
    const level = priority.split(":")[1]?.trim();
    return pickModePhrase("levelUpChave").replace("{level}", level);
  }

  if (priority.startsWith("item fechado:")) {
    const item = priority.split(":")[1]?.trim();
    return pickModePhrase("itemFechado").replace("{item}", item);
  }

  if (priority.startsWith("inimigo counter antiCura")) {
    return pickModePhrase("inimigoAntiCura");
  }

  if (priority.startsWith("inimigo counter armadura")) {
    return pickModePhrase("inimigoArmadura");
  }

  if (priority.startsWith("inimigo counter resistMagica")) {
    return pickModePhrase("inimigoResistMagica");
  }

  if (priority.startsWith("inimigo item:")) {
    // format: "inimigo item: ChampName:ItemName"
    const after = priority.slice("inimigo item:".length).trim();
    const sepIdx = after.indexOf(":");
    if (sepIdx > 0) {
      const name = after.slice(0, sepIdx).trim();
      const item = after.slice(sepIdx + 1).trim();
      return pickModePhrase("inimigoItemPerigoso").replace(/\{name\}/g, name).replace(/\{item\}/g, item);
    }
  }

  if (priority === "perdemos inibidor") {
    return pickModePhrase("inibidorPerdido");
  }

  if (priority === "pegamos inibidor inimigo") {
    return pickModePhrase("inibidorInimigo");
  }

  if (priority === "vitória") {
    return pickModePhrase("vitoriaPartida");
  }

  if (priority === "derrota") {
    return pickModePhrase("derrotaPartida");
  }

  if (priority.startsWith("gank oportunidade:")) {
    const match = priority.match(/gank oportunidade: (\w+)/);
    const lane = match ? match[1] : "lane";
    return pickModePhrase("jungleGank").replace("{lane}", lane);
  }

  if (priority.startsWith("lane precisa de ajuda:")) {
    const lane = priority.replace("lane precisa de ajuda: ", "").trim();
    return pickModePhrase("junglePressao").replace("{lane}", lane);
  }

  if (priority.startsWith("gank timing:")) {
    const content = priority.replace("gank timing: ", "");
    const laneMatch = content.match(/(top|mid|bot|jungle)/i);
    const lane = laneMatch ? laneMatch[1].toLowerCase() : "lane";

    let phraseKey: string;
    if (content.includes("está limpando a selva") || content.includes("aproveita para pressionar")) {
      phraseKey = "jungleTimingOfensivo";
    } else if (content.includes("segunda rotação") && content.includes("pressionar")) {
      phraseKey = "jungleTimingOfensivo";
    } else if (content.includes("segunda rotação")) {
      phraseKey = "jungleTimingSegundaRotacao";
    } else if (content.includes("morreu") && content.includes("aproveita")) {
      phraseKey = "jungleTimingMorteOfensivo";
    } else if (content.includes("morreu")) {
      phraseKey = "jungleTimingMorte";
    } else {
      phraseKey = "jungleTimingDefensivo";
    }

    return pickModePhrase(phraseKey).replace("{lane}", lane);
  }

  if (priority === "ace inimigo" || priority.startsWith("ace inimigo:")) {
    const obj = priority.includes(":") ? priority.split(":")[1]?.trim() : null;
    if (obj) {
      return `Ace! Vai pro ${obj} agora.`;
    }
    return pickModePhrase("aceInimigo");
  }

  if (priority === "ace aliado") {
    return pickModePhrase("aceAliado");
  }

  if (priority.startsWith("multikill inimigo:")) {
    const parts = priority.slice("multikill inimigo:".length).trim().split(":");
    const name = parts[0]?.trim() ?? "";
    const type = parts[1]?.trim() ?? "multi kill";
    return pickModePhrase("multikillInimigo").replace(/\{name\}/g, name).replace(/\{type\}/g, type);
  }

  if (priority.startsWith("multikill aliado:")) {
    const parts = priority.slice("multikill aliado:".length).trim().split(":");
    const name = parts[0]?.trim() ?? "";
    const type = parts[1]?.trim() ?? "multi kill";
    return pickModePhrase("multikillAliado").replace(/\{name\}/g, name).replace(/\{type\}/g, type);
  }

  if (priority.startsWith("roubaram ")) {
    const name = priority.replace("roubaram ", "");
    return pickModePhrase("objetivoRoubado").replace(/\{name\}/g, name);
  }

  if (priority.startsWith("roubamos ")) {
    const name = priority.replace("roubamos ", "");
    return pickModePhrase("objetivoRoubadoPorNos").replace(/\{name\}/g, name);
  }

  if (priority === "first blood aliado") {
    return pickModePhrase("firstBlood");
  }

  if (priority === "first blood inimigo") {
    return pickModePhrase("firstBloodInimigo");
  }

  if (priority === "inibidor inimigo voltou") {
    return pickModePhrase("inibidorVoltou");
  }

  if (priority.startsWith("alma do dragão aliada:")) {
    const count = priority.split(":")[1]?.trim()?.replace("falta ", "") ?? "1";
    return pickModePhrase("dragonSoulProximo").replace(/\{count\}/g, count);
  }

  if (priority.startsWith("alma do dragão inimiga:")) {
    const count = priority.split(":")[1]?.trim()?.replace("falta ", "") ?? "1";
    return pickModePhrase("dragonSoulInimigoProximo").replace(/\{count\}/g, count);
  }

  if (priority === "cs alerta") {
    return pickModePhrase("csAlerta");
  }

  if (priority === "ward alerta") {
    return pickModePhrase("wardAlerta");
  }

  if (priority.startsWith("dragão tipo aliado:") || priority.startsWith("dragão tipo inimigo:")) {
    const isAlly = priority.startsWith("dragão tipo aliado:");
    const type = priority.split(":")[1]?.trim() ?? "";
    const typeNames: Record<string, string> = {
      Fire: "fogo", Earth: "terra", Water: "água",
      Air: "vento", Hextech: "hextec", Chemtech: "químico", Elder: "ancião",
    };
    const allyHints: Record<string, string> = {
      Fire: "Bom pro dano do time.",
      Earth: "Aumenta resistência do time.",
      Water: "Regeneração extra pro time.",
      Air: "Velocidade pro time.",
      Hextech: "Aceleração de habilidade pro time.",
      Chemtech: "Dano e cura em luta.",
    };
    const enemyHints: Record<string, string> = {
      Fire: "Inimigo com mais dano agora.",
      Earth: "Inimigo mais resistente agora.",
      Water: "Inimigo com regeneração extra.",
      Air: "Inimigo mais rápido agora.",
      Hextech: "Inimigo com mais aceleração de habilidade.",
      Chemtech: "Inimigo com dano e cura extra em luta.",
    };
    const translated = typeNames[type] ?? type;
    const hint = isAlly ? (allyHints[type] ?? "") : (enemyHints[type] ?? "");
    const phraseKey = isAlly ? "dragonTipo" : "dragonTipoInimigo";
    return pickModePhrase(phraseKey).replace(/\{type\}/g, translated).replace(/\{hint\}/g, hint);
  }

  if (priority.startsWith("lane ouro desvantagem:")) {
    const parts = priority.slice("lane ouro desvantagem:".length).trim().split(":");
    const opponent = parts[0]?.trim() ?? "";
    const gold = parts[1]?.trim() ?? "";
    return pickModePhrase("laneVantagemOuro").replace(/\{opponent\}/g, opponent).replace(/\{gold\}/g, gold);
  }

  if (priority.startsWith("lane ouro vantagem:")) {
    const parts = priority.slice("lane ouro vantagem:".length).trim().split(":");
    const opponent = parts[0]?.trim() ?? "";
    const gold = parts[1]?.trim() ?? "";
    return pickModePhrase("laneDesvantagemOuro").replace(/\{opponent\}/g, opponent).replace(/\{gold\}/g, gold);
  }

  const sentence = toSentence(priority);
  return sentence.endsWith(".") ? sentence : `${sentence}.`;
}

// ── prompt builder ───────────────────────────────────────────────

function compactPlayer(player: SnapshotPlayer): string {
  return `${player.championName}(${player.kills}/${player.deaths}/${player.assists},nv${player.level})`;
}

function buildPrompt(
  snapshot: GameSnapshot,
  triggers: string[],
  priority: string | null,
  strategicContext: StrategicContext
): string {
  const allies = snapshot.alliedPlayers.map(compactPlayer).join(", ");
  const enemies = snapshot.enemyPlayers.map(compactPlayer).join(", ");

  const position = snapshot.activePlayerPosition ?? "UNKNOWN";
  const lines = [
    `${Math.floor(snapshot.gameTime / 60)}min | ${snapshot.activePlayerChampion} nv${snapshot.activePlayerLevel} ${snapshot.activePlayerKda} | ouro:${snapshot.activePlayerGold} | posição: ${position}`,
    `Aliados: ${allies}`,
    `Inimigos: ${enemies}`
  ];

  if (triggers.length > 0) {
    lines.push(`Gatilhos: ${triggers.join("; ")}`);
  }

  if (priority) {
    lines.push(`Prioridade: ${priority}`);
  }

  if (strategicContext?.scalingRead) {
    lines.push(`Escala: ${strategicContext.scalingRead}`);
  }

  if (strategicContext?.enemyThreat) {
    const t = strategicContext.enemyThreat;
    lines.push(`Ameaça: ${t.championName} ${t.kda} [${t.build.join(",")}]`);
  }

  if (strategicContext?.objectiveStates?.length > 0) {
    const objs = strategicContext.objectiveStates.map((o) =>
      o.available ? `${o.name}: disponível` : `${o.name}: morto (nasce em ${o.spawnIn})`
    );
    lines.push(`Objetivos: ${objs.join(" | ")}`);
  }

  return lines.join("\n");
}

// ── main decision function ───────────────────────────────────────

export async function decideCoaching(
  snapshot: GameSnapshot,
  triggers: string[],
  strategicContext: StrategicContext
): Promise<CoachDecision> {
  const priority = heuristicAlert(snapshot, triggers);
  const fallback = fallbackMessage(priority);

  if (isSimpleTrigger(priority)) {
    return {
      shouldSpeak: !!fallback,
      message: fallback,
      reason: `heurística direta: ${priority}`,
      priority,
      prompt: "",
      rawModelMessage: "",
      fallbackUsed: true,
      llmMs: 0,
      llmTokens: null,
      llmError: null,
      skippedLlm: true
    };
  }

  const hasStrategicContext =
    priority !== null ||
    triggers.length > 0 ||
    strategicContext?.objectiveStates?.some((o) => o.available);

  if (!hasStrategicContext) {
    return {
      shouldSpeak: false,
      message: "",
      reason: "sem contexto estratégico para LLM",
      priority,
      prompt: "",
      rawModelMessage: "",
      fallbackUsed: false,
      llmMs: 0,
      llmTokens: null,
      llmError: null,
      skippedLlm: true
    };
  }

  if (!hasLlmConfig()) {
    return {
      shouldSpeak: !!fallback,
      message: fallback,
      reason: "llm desabilitada ou nao configurada",
      priority,
      prompt: "",
      rawModelMessage: "",
      fallbackUsed: !!fallback,
      llmMs: 0,
      llmTokens: null,
      llmError: null,
      skippedLlm: true
    };
  }

  const prompt = buildPrompt(snapshot, triggers, priority, strategicContext);

  let message = "";
  let llmMs = 0;
  let llmTokens = null;
  let llmError = null;
  const llmStart = performance.now();
  try {
    const result = await createTextResponse({
      apiKey: settings.zaiApiKey,
      endpoint: settings.zaiEndpoint,
      model: settings.zaiModel,
      protocol: settings.llmProtocol,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      maxTokens: 500,
    });
    llmMs = Math.round(performance.now() - llmStart);
    message = result.message.trim();
    llmTokens = result.usage ?? null;
  } catch (error) {
    const err = error as Error;
    llmMs = Math.round(performance.now() - llmStart);
    llmError = err.message;
    console.error(`[Coach] LLM erro (${llmMs}ms):`, err.message);
  }

  if (message && isTruncated(message)) {
    message = "";
  }

  if (!message || message.toUpperCase() === "SILENCIO") {
    if (fallback) {
      return {
        shouldSpeak: true,
        message: fallback,
        reason: `fallback: ${priority}`,
        priority,
        prompt,
        rawModelMessage: message,
        fallbackUsed: true,
        llmMs,
        llmTokens,
        llmError,
        skippedLlm: false
      };
    }

    return {
      shouldSpeak: false,
      message: "",
      reason: priority ?? "sem evento relevante",
      priority,
      prompt,
      rawModelMessage: message,
      fallbackUsed: false,
      llmMs,
      llmTokens,
      llmError,
      skippedLlm: false
    };
  }

  return {
    shouldSpeak: true,
    message,
    reason: priority ?? "resposta do modelo",
    priority,
    prompt,
    rawModelMessage: message,
    fallbackUsed: false,
    llmMs,
    llmTokens,
    llmError,
    skippedLlm: false
  };
}

export async function getMatchupTip(snapshot: GameSnapshot): Promise<MatchupTip | null> {
  if (!hasLlmConfig()) {
    return null;
  }

  const myChamp = snapshot.activePlayerChampion;
  const myPos = snapshot.activePlayerPosition ?? "UNKNOWN";
  const laneOpponent = snapshot.enemyPlayers.find((p) => p.position === myPos);
  const otherEnemies = snapshot.enemyPlayers.filter((p) => p.position !== myPos).map((p) => p.championName).join(", ");

  const prompt = laneOpponent
    ? `Você é ${myChamp} na lane ${myPos}. Seu adversário direto é ${laneOpponent.championName}. Outros inimigos: ${otherEnemies}. Dê a dica de matchup.`
    : `Você é ${myChamp} na posição ${myPos}. Inimigos: ${snapshot.enemyPlayers.map((p) => p.championName).join(", ")}. Dê a dica de matchup.`;

  let message = "";
  let llmMs = 0;
  let llmTokens: unknown = null;
  const llmStart = performance.now();
  try {
    const result = await createTextResponse({
      apiKey: settings.zaiApiKey,
      endpoint: settings.zaiEndpoint,
      model: settings.zaiModel,
      protocol: settings.llmProtocol,
      messages: [
        { role: "system", content: buildMatchupPrompt() },
        { role: "user", content: prompt }
      ],
      temperature: 0.4,
      maxTokens: 500,
    });
    llmMs = Math.round(performance.now() - llmStart);
    message = result.message.trim();
    llmTokens = result.usage ?? null;
  } catch (error) {
    const err = error as Error;
    llmMs = Math.round(performance.now() - llmStart);
    console.error(`[Coach] Matchup LLM erro (${llmMs}ms):`, err.message);
  }

  if (!message || isTruncated(message)) {
    return null;
  }

  return { message, llmMs, llmTokens };
}
