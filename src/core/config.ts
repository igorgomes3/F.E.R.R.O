import "dotenv/config";

import type { CoreSettings } from "./types";

function getNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) return fallback;
  return value.toLowerCase() === "true";
}

function getLlmProtocol(): CoreSettings["llmProtocol"] {
  return process.env.LLM_PROTOCOL === "responses" ? "responses" : "chat_completions";
}

export const settings: CoreSettings = {
  zaiApiKey: process.env.ZAI_API_KEY ?? "",
  zaiEndpoint:
    process.env.ZAI_ENDPOINT ?? "https://api.z.ai/api/coding/paas/v4/chat/completions",
  zaiModel: process.env.ZAI_MODEL ?? "glm-5",
  llmProtocol: getLlmProtocol(),
  liveClientBaseUrl: process.env.LIVE_CLIENT_BASE_URL ?? "https://127.0.0.1:2999",
  ddragonVersionsUrl:
    process.env.DDRAGON_VERSIONS_URL ?? "https://ddragon.leagueoflegends.com/api/versions.json",
  ddragonCdnUrl:
    process.env.DDRAGON_CDN_URL ?? "https://ddragon.leagueoflegends.com/cdn",
  pollIntervalSeconds: getNumber("POLL_INTERVAL_SECONDS", 5),
  coachingIntervalSeconds: getNumber("COACHING_INTERVAL_SECONDS", 20),
  mapReminderIntervalSeconds: getNumber("MAP_REMINDER_INTERVAL_SECONDS", 45),
  stalledGoldThreshold: getNumber("STALLED_GOLD_THRESHOLD", 1500),
  dragonFirstSpawnSeconds: getNumber("DRAGON_FIRST_SPAWN_SECONDS", 300),
  dragonRespawnSeconds: getNumber("DRAGON_RESPAWN_SECONDS", 300),
  grubsFirstSpawnSeconds: getNumber("GRUBS_FIRST_SPAWN_SECONDS", 480),
  grubsDespawnSeconds: getNumber("GRUBS_DESPAWN_SECONDS", 885),
  heraldFirstSpawnSeconds: getNumber("HERALD_FIRST_SPAWN_SECONDS", 900),
  heraldDespawnSeconds: getNumber("HERALD_DESPAWN_SECONDS", 1185),
  baronFirstSpawnSeconds: getNumber("BARON_FIRST_SPAWN_SECONDS", 1200),
  baronRespawnSeconds: getNumber("BARON_RESPAWN_SECONDS", 360),
  objectiveOneMinuteCallSeconds: getNumber("OBJECTIVE_ONE_MINUTE_CALL_SECONDS", 70),
  objectiveThirtySecondsCallSeconds: getNumber("OBJECTIVE_THIRTY_SECONDS_CALL_SECONDS", 35),
  objectiveTenSecondsCallSeconds: getNumber("OBJECTIVE_TEN_SECONDS_CALL_SECONDS", 12),
  ttsEnabled: getBoolean("TTS_ENABLED", true),
  ttsProvider: process.env.TTS_PROVIDER ?? "auto",
  ttsVolume: getNumber("TTS_VOLUME", 0.8),
  ttsVoice: process.env.TTS_VOICE ?? undefined,
  piperExecutable: process.env.PIPER_EXECUTABLE ?? "piper",
  piperModelPath: process.env.PIPER_MODEL_PATH ?? "",
  piperSpeaker: getNumber("PIPER_SPEAKER", -1),
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY ?? "",
  elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? "",
  coachMessageMode: process.env.COACH_MESSAGE_MODE ?? "serio",
  logsDir: process.env.LOGS_DIR ?? "./logs",
  logSnapshots: getBoolean("LOG_SNAPSHOTS", true),
  logLlmPayloads: getBoolean("LOG_LLM_PAYLOADS", true),
  simulationDurationSeconds: getNumber("SIMULATION_DURATION_SECONDS", 60),
  simulationStartGameTimeSeconds: getNumber("SIMULATION_START_GAME_TIME_SECONDS", 240),
  simulationTickMs: getNumber("SIMULATION_TICK_MS", 1000)
};

export function getZaiBaseUrl(): string {
  return settings.zaiEndpoint.trim().replace(/\/+$/, "").replace(/\/(?:chat\/completions|responses)$/, "");
}

export function assertConfig(): void {
  if (!settings.zaiApiKey) {
    throw new Error("ZAI_API_KEY nao definida. Configure sua chave da Z.ai no arquivo .env.");
  }
}
