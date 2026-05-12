import { ipcMain, dialog, app, type BrowserWindow } from "electron";
import { IPC } from "../../shared/channels";
import * as configService from "../services/config-service";
import { engine } from "../services/engine";
import { installPiper, PIPER_VOICES, getVoicesDir, getPiperDir } from "../services/piper-installer";
import { installWhisper } from "../services/whisper-installer";
import { VoiceInputController } from "../services/voice-input-controller";
import { setVoiceInputController } from "../services/voice-input-singleton";
import { routeVoiceCommand } from "../services/voice-command-router";
import { listPiperVoices, listElevenLabsVoices, listSystemVoices } from "../services/voice-list-service";
import { getLatestElevenLabsUsageSummary } from "../services/elevenlabs-usage-service";
import { getStartupState } from "../services/startup-state";
import { populateEnvFromConfig } from "../lib/settings-bridge";
import { createTextResponse } from "../../core/llm-client";
import type { LLMProviderType } from "../../shared/types";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";

const TAG = "[IPC]";
const MAX_VOICE_RECORDING_BYTES = 10 * 1024 * 1024;
const VOICE_RECORDING_DIR = path.join(os.tmpdir(), "ferro-voice");
const pendingVoiceRecordings = new Set<string>();
function log(...args: unknown[]) { console.log(TAG, ...args); }

function safeAsciiPreview(text: string, maxLen = 30): string {
  // Keep log output stable on Windows terminals with non-UTF8 code pages.
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
  return normalized.length > maxLen ? normalized.slice(0, maxLen) + "..." : normalized;
}

function safeEndpointMetadata(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    const query = url.search ? "?query" : "";
    return `${url.protocol}//${url.hostname}${url.pathname}${query}`;
  } catch {
    return "invalid-url";
  }
}

function keyFingerprint(apiKey: string): string {
  const clean = apiKey.trim();
  if (!clean) return "none";
  if (clean.length <= 8) return `${clean.slice(0, 2)}...(${clean.length})`;
  return `${clean.slice(0, 4)}...${clean.slice(-4)} (${clean.length})`;
}

function normalizeTtsProvider(provider: string): "piper" | "elevenlabs" | "say" {
  const normalized = provider.trim().toLowerCase();
  if (normalized === "piper") return "piper";
  if (normalized === "elevenlabs") return "elevenlabs";
  return "say";
}

type LlmTestProviderKey = Exclude<LLMProviderType, "none">;
const LLM_TEST_PROVIDER_KEYS: readonly LlmTestProviderKey[] = ["zai", "openai", "gemini", "custom"];

function normalizeLlmTestProvider(provider: unknown): LlmTestProviderKey | null {
  if (typeof provider !== "string") return null;
  const normalized = provider.trim().toLowerCase();
  return LLM_TEST_PROVIDER_KEYS.includes(normalized as LlmTestProviderKey) ? (normalized as LlmTestProviderKey) : null;
}

function emitConfigChanged(mainWindow: BrowserWindow, configPath: string, value: unknown): void {
  mainWindow.webContents.send(IPC.CONFIG_CHANGED, { path: configPath, value });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function saveVoiceRecording(audio: unknown): Promise<{ ok: true; filePath: string } | { ok: false; error: string }> {
  if (!(audio instanceof ArrayBuffer)) {
    return { ok: false, error: "Audio invalido." };
  }
  const buffer = Buffer.from(audio);
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_VOICE_RECORDING_BYTES || !isWavRecording(buffer)) {
    return { ok: false, error: "Audio invalido." };
  }

  await mkdir(VOICE_RECORDING_DIR, { recursive: true });
  const filePath = path.join(VOICE_RECORDING_DIR, `voice-${Date.now()}-${randomUUID()}.wav`);
  const resolvedPath = path.resolve(filePath);
  await writeFile(resolvedPath, buffer);
  pendingVoiceRecordings.add(resolvedPath);
  return { ok: true, filePath: resolvedPath };
}

function isWavRecording(buffer: Buffer): boolean {
  return buffer.byteLength >= 44 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE";
}

function resolveVoiceRecordingPath(filePath: unknown): string | null {
  if (typeof filePath !== "string") return null;
  const resolvedPath = path.resolve(filePath);
  const resolvedDir = path.resolve(VOICE_RECORDING_DIR);
  if (!resolvedPath.startsWith(resolvedDir + path.sep)) return null;
  if (!pendingVoiceRecordings.has(resolvedPath)) return null;
  pendingVoiceRecordings.delete(resolvedPath);
  return resolvedPath;
}

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  const voiceInput = new VoiceInputController({
    getConfig: () => ({ voiceInput: configService.getAll().voiceInput }),
    route: (transcript) => routeVoiceCommand(transcript, {
      resetTacticalMemory: () => engine.resetTacticalMemory(),
      handleTacticalCommand: (text) => engine.handleTacticalCommand(text),
      setTtsEnabled: (enabled) => {
        configService.setPath("tts.enabled", enabled);
        engine.syncConfig();
        emitConfigChanged(mainWindow, "tts.enabled", enabled);
      },
      getStatusSummary: () => {
        const state = engine.engineState;
        return `Engine ${state.status}. Voz ${state.ttsStatus}. LLM ${state.llmStatus}.`;
      },
    }),
    emit: (channel, payload) => mainWindow.webContents.send(channel, payload),
  });
  setVoiceInputController(voiceInput);

  // ── Config ──────────────────────────────────────────
  ipcMain.handle(IPC.CONFIG_GET, () => {
    return configService.getAll();
  });

  ipcMain.handle(IPC.CONFIG_SET, (_e, configPath: string, value: unknown) => {
    log("config:set", configPath, typeof value === "string" && value.length > 20 ? value.slice(0, 20) + "..." : value);
    configService.setPath(configPath, value);
    engine.syncConfig();
    emitConfigChanged(mainWindow, configPath, value);
  });

  ipcMain.handle(IPC.CONFIG_RESET, () => {
    log("config:reset");
    configService.reset();
    engine.syncConfig();
    emitConfigChanged(mainWindow, "config", null);
  });

  // ── Engine ──────────────────────────────────────────
  ipcMain.handle(IPC.ENGINE_START, async () => {
    log("engine:start");
    await engine.start();
  });

  ipcMain.handle(IPC.ENGINE_STOP, () => {
    log("engine:stop");
    engine.stop();
  });

  ipcMain.handle(IPC.ENGINE_STATUS, () => engine.engineState);

  ipcMain.handle(IPC.TACTICAL_MEMORY_COMMAND, (_e, text: unknown) => engine.handleTacticalCommand(text));

  ipcMain.handle(IPC.TACTICAL_MEMORY_LIST, () => engine.listTacticalCooldowns());

  ipcMain.handle(IPC.TACTICAL_MEMORY_RESET, () => engine.resetTacticalMemory());

  // ── Logs ────────────────────────────────────────────
  ipcMain.handle(IPC.LOGS_GET, () => []);
  ipcMain.handle(IPC.ELEVENLABS_USAGE_GET, async () => {
    try {
      const config = configService.getAll();
      return await getLatestElevenLabsUsageSummary(config.logging.logsDir);
    } catch (error) {
      console.error(TAG, "elevenlabs:usage:get error:", (error as Error).message);
      return null;
    }
  });
  ipcMain.handle(IPC.LOGS_CLEAR, () => {});

  // ── Match Analysis ──────────────────────────────────
  ipcMain.handle(IPC.MATCH_LIST, () => []);
  ipcMain.handle(IPC.MATCH_GET, () => null);

  ipcMain.handle(IPC.MATCH_LAST, async () => {
    try {
      const config = configService.getAll();
      const gameDir = path.join(config.logging.logsDir, "game");
      log("match:last loading from", gameDir);
      const mod = await import("../../core/match-analyzer");
      const sessions = await mod.listSessionSummaries(gameDir);
      if (!sessions || sessions.length === 0) {
        log("match:last no sessions found");
        return null;
      }
      const last = sessions[0];
      log("match:last analyzing session", last.sessionId);
      const analysis = await mod.getSessionAnalysis(gameDir, last.sessionId);
      return analysis;
    } catch (error) {
      console.error(TAG, "match:last error:", (error as Error).message);
      return null;
    }
  });

  // ── Voice listing ───────────────────────────────────
  ipcMain.handle(IPC.VOICES_LIST_PIPER, async () => {
    const voices = await listPiperVoices();
    log("voices:list-piper found", voices.length, "voices");
    return voices;
  });

  ipcMain.handle(IPC.VOICES_LIST_ELEVENLABS, async (_e, apiKey: string) => {
    const started = Date.now();
    const fingerprint = keyFingerprint(apiKey);
    log("voices:list-elevenlabs start", "key:", fingerprint);
    try {
      const voices = await listElevenLabsVoices(apiKey);
      const elapsed = Date.now() - started;
      const sample = voices.slice(0, 3).map((v) => `${v.name}(${v.id.slice(0, 6)}...)`).join(", ");
      log(
        "voices:list-elevenlabs done",
        "count:", voices.length,
        "ms:", elapsed,
        sample ? "sample:" : "",
        sample || ""
      );
      return voices;
    } catch (error) {
      const elapsed = Date.now() - started;
      console.error(TAG, "voices:list-elevenlabs error after", elapsed, "ms:", (error as Error).message);
      return [];
    }
  });

  ipcMain.handle(IPC.VOICES_LIST_SYSTEM, async () => {
    const voices = await listSystemVoices();
    log("voices:list-system found", voices.length, "voices");
    return voices;
  });

  // ── TTS Test ────────────────────────────────────────
  ipcMain.handle(IPC.TTS_TEST, async (_e, _provider: string, text: string) => {
    log("tts:test provider:", _provider, "text:", safeAsciiPreview(text));
    try {
      populateEnvFromConfig();
      const config = configService.getAll();
      const configProvider =
        config.tts.activeProvider === "piper"
          ? "piper"
          : config.tts.activeProvider === "elevenlabs"
            ? "elevenlabs"
            : "say";
      const requestedProvider = normalizeTtsProvider(_provider);
      const ttsProvider = requestedProvider;

      if (requestedProvider !== configProvider) {
        log("tts:test provider mismatch", "requested:", requestedProvider, "config:", configProvider);
      }

      // Recover gracefully when Piper is selected but modelPath was never set.
      if (ttsProvider === "piper" && !config.tts.providers.piper.modelPath) {
        const piperVoices = await listPiperVoices();
        if (piperVoices.length > 0) {
          const fallbackModelPath = piperVoices[0].id;
          configService.setPath("tts.providers.piper.modelPath", fallbackModelPath);
          log("tts:test auto-selected piper model:", fallbackModelPath);
        }
      }

      const configMod = await import("../../core/config");
      const currentConfig = configService.getAll();

      // Mutate cached settings to reflect current config
      configMod.settings.ttsProvider = ttsProvider;
      configMod.settings.ttsEnabled = currentConfig.tts.enabled;
      configMod.settings.piperExecutable = currentConfig.tts.providers.piper.executablePath;
      configMod.settings.piperModelPath = currentConfig.tts.providers.piper.modelPath;
      configMod.settings.piperSpeaker = currentConfig.tts.providers.piper.speaker;
      configMod.settings.elevenlabsApiKey = currentConfig.tts.providers.elevenlabs.apiKey;
      configMod.settings.elevenlabsVoiceId = currentConfig.tts.providers.elevenlabs.voiceId;
      configMod.settings.ttsVoice = currentConfig.tts.providers.system.voice;

      log(
        "tts:test using",
        ttsProvider,
        "voiceId:",
        currentConfig.tts.providers.elevenlabs.voiceId || "(none)",
        "systemVoice:",
        currentConfig.tts.providers.system.voice || "(default)",
        "piperModel:",
        currentConfig.tts.providers.piper.modelPath || "(none)"
      );

      const voiceMod = await import("../../core/voice");
      const result = await voiceMod.speak(text);
      log("tts:test success, provider:", result?.provider, "generateMs:", result?.generateMs);
      return { ok: true, provider: result?.provider, generateMs: result?.generateMs };
    } catch (error) {
      console.error(TAG, "tts:test error:", (error as Error).message);
      return { ok: false, error: (error as Error).message };
    }
  });

  // ── LLM Test ────────────────────────────────────────
  ipcMain.handle(IPC.LLM_TEST, async (_e, provider: unknown) => {
    log("llm:test provider:", provider);
    try {
      const config = configService.getAll();
      const providerKey = normalizeLlmTestProvider(provider);
      if (!providerKey) {
        log("llm:test invalid provider:", provider);
        return { ok: false, error: "API key não configurada" };
      }

      const pConfig = config.llm.providers[providerKey];
      if (!pConfig?.apiKey) {
        log("llm:test no API key for", provider);
        return { ok: false, error: "API key não configurada" };
      }

      log("llm:test calling", safeEndpointMetadata(pConfig.endpoint), "model:", pConfig.model, "protocol:", pConfig.protocol ?? "chat_completions");

      const start = Date.now();
      const result = await createTextResponse({
        apiKey: pConfig.apiKey,
        endpoint: pConfig.endpoint,
        model: pConfig.model,
        protocol: pConfig.protocol ?? "chat_completions",
        messages: [{ role: "user", content: "Responda apenas: OK" }],
        maxTokens: 10,
      });
      const ms = Date.now() - start;
      const message = result.message;
      log("llm:test success in", ms, "ms, responseChars:", message.length, "preview:", safeAsciiPreview(message));
      return { ok: true, response: message, ms };
    } catch (error) {
      console.error(TAG, "llm:test error:", (error as Error).message);
      return { ok: false, error: (error as Error).message };
    }
  });

  // ── LLM Coaching Test ──────────────────────────────
  ipcMain.handle(IPC.LLM_TEST_COACHING, async () => {
    try {
      const cfg = configService.getAll();
      if (cfg.llm.activeProvider === "none") {
        return { ok: false, error: "LLM não configurada" };
      }

      const [coachMod, configMod] = await Promise.all([
        import("../../core/coach"),
        import("../../core/config"),
      ]);

      const llm = cfg.llm.providers[cfg.llm.activeProvider];
      configMod.settings.zaiApiKey = llm.apiKey;
      configMod.settings.zaiEndpoint = llm.endpoint;
      configMod.settings.zaiModel = llm.model;
      configMod.settings.llmProtocol = llm.protocol ?? "chat_completions";
      configMod.settings.coachMessageMode = cfg.coach.messageMode;

      const tip = await coachMod.getMatchupTip({
        gameTime: 50,
        activePlayerName: "Jogador",
        activePlayerChampion: "Jinx",
        activePlayerLevel: 3,
        activePlayerIsDead: false,
        activePlayerRespawnTimer: 0,
        activePlayerGold: 1200,
        activePlayerTeam: "ORDER",
        activePlayerKda: "1/0/2",
        activePlayerPosition: "BOTTOM",
        alliedPlayers: [],
        enemyPlayers: [
          { summonerName: "E1", championName: "Draven", level: 3, kills: 2, deaths: 0, assists: 1, creepScore: 30, currentGold: 1500, items: [], position: "BOTTOM", wardScore: 0 },
          { summonerName: "E2", championName: "Leona", level: 3, kills: 0, deaths: 1, assists: 2, creepScore: 10, currentGold: 800, items: [], position: "UTILITY", wardScore: 0 },
          { summonerName: "E3", championName: "Zed", level: 4, kills: 3, deaths: 0, assists: 0, creepScore: 45, currentGold: 2000, items: [], position: "MIDDLE", wardScore: 0 },
          { summonerName: "E4", championName: "Darius", level: 3, kills: 0, deaths: 0, assists: 0, creepScore: 35, currentGold: 1100, items: [], position: "TOP", wardScore: 0 },
          { summonerName: "E5", championName: "Lee Sin", level: 4, kills: 1, deaths: 0, assists: 1, creepScore: 25, currentGold: 1300, items: [], position: "JUNGLE", wardScore: 0 },
        ],
        events: []
      });

      if (!tip) {
        return { ok: false, error: "LLM retornou resposta vazia" };
      }

      return { ok: true, message: tip.message, llmMs: tip.llmMs };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  // ── Piper ───────────────────────────────────────────
  ipcMain.handle(IPC.PIPER_AVAILABLE_VOICES, () => PIPER_VOICES);

  ipcMain.handle(IPC.PIPER_INSTALL, async (_e, voiceId: string) => {
    log("piper:install voiceId:", voiceId);
    const result = await installPiper(voiceId, mainWindow);
    if (result.ok) {
      const voice = PIPER_VOICES.find((v) => v.id === voiceId);
      if (voice) {
        const voicesDir = getVoicesDir();
        const piperDir = getPiperDir();
        const exePath = path.join(piperDir, "piper.exe");
        const modelPath = path.join(voicesDir, `${voice.file}.onnx`);
        configService.setPath("tts.providers.piper.executablePath", exePath);
        configService.setPath("tts.providers.piper.modelPath", modelPath);
        emitConfigChanged(mainWindow, "tts.providers.piper.executablePath", exePath);
        emitConfigChanged(mainWindow, "tts.providers.piper.modelPath", modelPath);
        log("piper:install success. exe:", exePath, "model:", modelPath);
      }
    } else {
      console.error(TAG, "piper:install failed:", result.error);
    }
    return result;
  });

  // ── Voice Input ─────────────────────────────────────
  ipcMain.handle(IPC.VOICE_INPUT_STATUS_GET, () => voiceInput.getStatus());

  ipcMain.handle(IPC.VOICE_INPUT_SETTINGS_UPDATE, async (_e, configPath: string, value: unknown) => {
    const wasRecording = voiceInput.getStatus().state === "recording";
    configService.setPath(configPath, value);
    engine.syncConfig();
    emitConfigChanged(mainWindow, configPath, value);
    if (wasRecording && configPath.startsWith("voiceInput.")) {
      mainWindow.webContents.send(IPC.VOICE_INPUT_CAPTURE_CANCEL_REQUEST, { reason: "settings_changed" });
    }
    voiceInput.refreshState();
    await voiceInput.registerGlobalHotkeys();
    return voiceInput.getStatus();
  });

  ipcMain.handle(IPC.VOICE_INPUT_INSTALL, async () => {
    const result = await installWhisper(mainWindow);
    if (result.ok) {
      configService.setPath("voiceInput.stt.executablePath", result.executablePath);
      configService.setPath("voiceInput.stt.modelPath", result.modelPath);
      emitConfigChanged(mainWindow, "voiceInput.stt.executablePath", result.executablePath);
      emitConfigChanged(mainWindow, "voiceInput.stt.modelPath", result.modelPath);
      voiceInput.refreshState();
    }
    return result;
  });

  ipcMain.handle(IPC.VOICE_INPUT_TEST_TRANSCRIBE, async () => {
    const startStatus = await voiceInput.startRecording();
    if (startStatus.state !== "recording") return startStatus;
    await delay(300);
    return voiceInput.stopRecording();
  });

  ipcMain.handle(IPC.VOICE_INPUT_START_RECORDING, () => voiceInput.beginExternalRecording());

  ipcMain.handle(IPC.VOICE_INPUT_STOP_RECORDING, () => voiceInput.getStatus());

  ipcMain.handle(IPC.VOICE_INPUT_CANCEL_RECORDING, () => voiceInput.cancelRecording());

  ipcMain.handle(IPC.VOICE_INPUT_RECORDING_SAVE, (_e, audio: unknown) => saveVoiceRecording(audio));

  ipcMain.handle(IPC.VOICE_INPUT_RECORDING_PROCESS, (_e, filePath: string, durationMs: number) => {
    const resolvedPath = resolveVoiceRecordingPath(filePath);
    if (!resolvedPath || typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) {
      return { ok: false, kind: "error", message: "Audio invalido." };
    }
    return voiceInput.processExternalRecording(resolvedPath, durationMs);
  });

  // ── System ──────────────────────────────────────────
  ipcMain.handle(IPC.DIALOG_SELECT_DIR, async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(IPC.APP_VERSION, () => app.getVersion());

  ipcMain.handle(IPC.APP_GET_STARTUP_STATE, () => {
    const startup = getStartupState();
    log("app:getStartupState", startup);
    return startup;
  });

  ipcMain.handle(IPC.APP_COMPLETE_ONBOARDING, () => {
    log("app:completeOnboarding");
    configService.setPath("app.onboardingCompleted", true);
    emitConfigChanged(mainWindow, "app.onboardingCompleted", true);
  });

  log("All IPC handlers registered");
}
