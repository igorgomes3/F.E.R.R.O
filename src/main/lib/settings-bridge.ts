import { getAll } from "../services/config-service";
import type { FerroConfig } from "../../shared/types";

/**
 * Populates process.env with values from electron-store,
 * so that core modules (config.js, coach.js, game.js) read correct values
 * when they are dynamically imported.
 *
 * Must be called BEFORE importing any core module.
 */
export function populateEnvFromConfig(): void {
  const config = getAll();

  // LLM — handle "none" provider
  if (config.llm.activeProvider === "none") {
    process.env.ZAI_API_KEY = "";
    process.env.ZAI_ENDPOINT = "";
    process.env.ZAI_MODEL = "";
    process.env.LLM_PROTOCOL = "chat_completions";
  } else {
    const active = config.llm.providers[config.llm.activeProvider];
    process.env.ZAI_API_KEY = active.apiKey;
    process.env.ZAI_ENDPOINT = active.endpoint;
    process.env.ZAI_MODEL = active.model;
    process.env.LLM_PROTOCOL = active.protocol ?? "chat_completions";
  }

  // Game
  process.env.LIVE_CLIENT_BASE_URL = "https://127.0.0.1:2999";
  process.env.POLL_INTERVAL_SECONDS = String(config.game.pollIntervalSeconds);
  process.env.COACHING_INTERVAL_SECONDS = String(config.game.coachingIntervalSeconds);
  process.env.MAP_REMINDER_INTERVAL_SECONDS = String(config.game.mapReminderIntervalSeconds);
  process.env.STALLED_GOLD_THRESHOLD = String(config.game.stalledGoldThreshold);

  // Objectives
  process.env.DRAGON_FIRST_SPAWN_SECONDS = String(config.objectives.dragonFirstSpawn);
  process.env.DRAGON_RESPAWN_SECONDS = String(config.objectives.dragonRespawn);
  process.env.GRUBS_FIRST_SPAWN_SECONDS = String(config.objectives.grubsFirstSpawn);
  process.env.GRUBS_DESPAWN_SECONDS = String(config.objectives.grubsDespawn);
  process.env.HERALD_FIRST_SPAWN_SECONDS = String(config.objectives.heraldFirstSpawn);
  process.env.HERALD_DESPAWN_SECONDS = String(config.objectives.heraldDespawn);
  process.env.BARON_FIRST_SPAWN_SECONDS = String(config.objectives.baronFirstSpawn);
  process.env.BARON_RESPAWN_SECONDS = String(config.objectives.baronRespawn);
  process.env.OBJECTIVE_ONE_MINUTE_CALL_SECONDS = String(config.objectives.oneMinuteCall);
  process.env.OBJECTIVE_THIRTY_SECONDS_CALL_SECONDS = String(config.objectives.thirtySecondsCall);
  process.env.OBJECTIVE_TEN_SECONDS_CALL_SECONDS = String(config.objectives.tenSecondsCall);

  // TTS — always enabled
  process.env.TTS_ENABLED = "true";
  process.env.TTS_PROVIDER =
    config.tts.activeProvider === "piper"
      ? "piper"
      : config.tts.activeProvider === "elevenlabs"
        ? "elevenlabs"
        : "say";
  process.env.TTS_VOICE = config.tts.providers.system.voice;
  process.env.PIPER_EXECUTABLE = config.tts.providers.piper.executablePath;
  process.env.PIPER_MODEL_PATH = config.tts.providers.piper.modelPath;
  process.env.PIPER_SPEAKER = String(config.tts.providers.piper.speaker);
  process.env.ELEVENLABS_API_KEY = config.tts.providers.elevenlabs.apiKey;
  process.env.ELEVENLABS_VOICE_ID = config.tts.providers.elevenlabs.voiceId;
  process.env.COACH_MESSAGE_MODE = config.coach.messageMode;

  // Logging
  process.env.LOGS_DIR = config.logging.logsDir;
  process.env.LOG_SNAPSHOTS = String(config.logging.logSnapshots);
  process.env.LOG_LLM_PAYLOADS = String(config.logging.logLlmPayloads);
}
