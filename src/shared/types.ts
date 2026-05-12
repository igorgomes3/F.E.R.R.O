// ── Engine ──────────────────────────────────────────────

export type EngineStatus =
  | "idle"
  | "waiting_for_game"
  | "coaching"
  | "paused"
  | "error";

export type TacticalPlanIntent = "fight" | "avoid_fight" | "prepare_objective" | "trade_objective" | "reset" | "pressure_lane" | "farm_safe";
export type TacticalPlanPriority = "low" | "medium" | "high";
export type TacticalPlanConfidence = "confirmed" | "estimated" | "unknown";

export interface TacticalPlanReason {
  kind: "objective" | "cooldown" | "death" | "threat" | "powerspike" | "lane" | "fallback";
  text: string;
  confidence: TacticalPlanConfidence;
  weight: number;
}

export interface TacticalPlan {
  intent: TacticalPlanIntent;
  priority: TacticalPlanPriority;
  summary: string;
  reasons: TacticalPlanReason[];
  confidence: TacticalPlanConfidence;
  createdAtGameTimeSeconds: number;
  expiresAtGameTimeSeconds?: number;
}

export interface EngineState {
  status: EngineStatus;
  gameDetected: boolean;
  gameTime: number;
  activeChampion: string;
  currentTacticalPlan: TacticalPlan | null;
  lastMessage: string;
  lastMessageSource: "llm" | "heuristic" | "fallback" | "";
  lastLLMMs: number;
  lastTTSMs: number;
  ttsStatus: "idle" | "speaking" | "error";
  llmStatus: "idle" | "calling" | "error" | "disabled";
  piperStatus: "installed" | "missing" | "error";
  errorMessage: string | null;
}

export type EngineEventType =
  | "status_change"
  | "state_update"
  | "game_detected"
  | "game_ended"
  | "coaching"
  | "silence"
  | "tts_start"
  | "tts_done"
  | "tts_error"
  | "llm_call"
  | "llm_response"
  | "llm_error"
  | "error";

export interface EngineEvent {
  type: EngineEventType;
  [key: string]: unknown;
}

// ── Config ─────────────────────────────────────────────

export type LLMProviderType = "none" | "zai" | "openai" | "gemini" | "custom";
export type LLMProtocol = "chat_completions" | "responses";
export type TTSProviderType = "piper" | "elevenlabs" | "system";
export type VoiceInputMode = "push_to_talk" | "toggle";
export type SttProviderType = "whisper_cpp";
export type SttLanguage = "pt" | "en" | "auto";
export type VoiceInputStatusState = "disabled" | "idle" | "recording" | "transcribing" | "routing" | "error";
export type MessageMode = "serio" | "meme" | "puto";

export interface LLMProviderConfig {
  apiKey: string;
  endpoint: string;
  model: string;
  protocol?: LLMProtocol;
  models?: string[];
}

export interface MessageCategoryConfig {
  enabled: boolean;
  cooldownSeconds: number;
}

export interface FerroConfig {
  llm: {
    activeProvider: LLMProviderType;
    providers: {
      zai: LLMProviderConfig;
      openai: LLMProviderConfig;
      gemini: LLMProviderConfig;
      custom: LLMProviderConfig;
    };
  };
  tts: {
    enabled: boolean;
    activeProvider: TTSProviderType;
    volume: number;
    providers: {
      piper: {
        executablePath: string;
        modelPath: string;
        speaker: number;
      };
      elevenlabs: {
        apiKey: string;
        voiceId: string;
      };
      system: {
        voice: string;
      };
    };
  };
  voiceInput: {
    enabled: boolean;
    mode: VoiceInputMode;
    pushToTalkHotkey: string;
    toggleHotkey: string;
    stt: {
      provider: SttProviderType;
      executablePath: string;
      modelPath: string;
      language: SttLanguage;
      threads: number;
    };
  };
  coach: {
    messageMode: MessageMode;
  };
  game: {
    pollIntervalSeconds: number;
    coachingIntervalSeconds: number;
    mapReminderIntervalSeconds: number;
    stalledGoldThreshold: number;
  };
  objectives: {
    dragonFirstSpawn: number;
    dragonRespawn: number;
    grubsFirstSpawn: number;
    grubsDespawn: number;
    heraldFirstSpawn: number;
    heraldDespawn: number;
    baronFirstSpawn: number;
    baronRespawn: number;
    oneMinuteCall: number;
    thirtySecondsCall: number;
    tenSecondsCall: number;
  };
  messages: Record<string, MessageCategoryConfig>;
  logging: {
    logsDir: string;
    logSnapshots: boolean;
    logLlmPayloads: boolean;
  };
  app: {
    onboardingCompleted: boolean;
    windowBounds: { x: number; y: number; width: number; height: number } | null;
  };
}

export interface StartupState {
  onboardingCompleted: boolean;
  needsOnboarding: boolean;
  piperBinaryInstalled: boolean;
  piperModelConfigured: boolean;
  piperModelExists: boolean;
  activeTtsProvider: TTSProviderType;
  engineAutoStartAllowed: boolean;
}

// ── Voice / Model selectors ────────────────────────────

export interface VoiceOption {
  id: string;
  name: string;
  description?: string;
}

export interface ModelOption {
  id: string;
  name: string;
}

// ── Logs ───────────────────────────────────────────────

export interface LogEntry {
  ts: string;
  sessionId: string;
  type: string;
  gameTime?: number;
  [key: string]: unknown;
}

export interface ElevenLabsUsageSummary {
  sessionId: string;
  ttsCount: number;
  totalChars: number;
  estimatedCredits: number;
  averageCharsPerMessage: number;
  durationSeconds: number;
  costBRL: number;
}

// ── Match Analysis ─────────────────────────────────────

export interface SessionSummary {
  sessionId: string;
  filename: string;
  startTime: string;
  sizeBytes: number;
}

// ── Piper ──────────────────────────────────────────────

export interface PiperVoiceOption {
  id: string;
  name: string;
  file: string;
  desc: string;
  size: string;
}

export interface PiperStatus {
  installed: boolean;
  path?: string;
}

export interface PiperProgress {
  stage: "downloading_binary" | "extracting" | "downloading_voice" | "verifying" | "done" | "error";
  percent: number;
  message: string;
}

export interface WhisperStatus {
  executableExists: boolean;
  modelExists: boolean;
  ready: boolean;
  executablePath: string;
  modelPath: string;
}

export interface WhisperProgress {
  stage: "downloading_binary" | "extracting" | "downloading_model" | "verifying" | "done" | "error";
  percent: number;
  message: string;
}

export type SttErrorCode = "missing_executable" | "missing_model" | "empty_audio" | "empty_transcript" | "process_failed" | "timeout";
export type SttResult =
  | { ok: true; transcript: string; durationMs: number }
  | { ok: false; errorCode: SttErrorCode; message: string };

export interface VoiceInputStatus {
  state: VoiceInputStatusState;
  enabled: boolean;
  mode: VoiceInputMode;
  pushToTalkHotkey: string;
  toggleHotkey: string;
  whisper: WhisperStatus;
  lastTranscript: string;
  lastResultMessage: string;
  errorMessage: string | null;
}

export type VoiceRouteResult =
  | { ok: true; kind: "app_command"; command: "reset_memory" | "mute_tts" | "unmute_tts" | "status"; message: string }
  | { ok: true; kind: "tactical_memory"; message: string; tacticalResult: TacticalCommandResult }
  | { ok: false; kind: "error"; message: string };

// ── Tactical Memory ─────────────────────────────────────

export type TacticalConfidence = "confirmed" | "estimated" | "expired" | "unknown";
export type TacticalFactSource = "manual" | "voice" | "game_api" | "llm";
export type TacticalFactKind = "cooldown" | "status" | "plan" | "note";
export type TacticalTeam = "ally" | "enemy" | "unknown";
export type CooldownSpell =
  | "flash"
  | "heal"
  | "ignite"
  | "exhaust"
  | "cleanse"
  | "ghost"
  | "teleport"
  | "smite"
  | "ultimate"
  | "item";

export interface TacticalFact {
  id: string;
  kind: TacticalFactKind;
  champion?: string;
  team: TacticalTeam;
  source: TacticalFactSource;
  text: string;
  gameTimeSeconds: number;
  createdAt: string;
  confidence: TacticalConfidence;
}

export interface ChampionCooldown {
  id: string;
  champion: string;
  spell: CooldownSpell;
  source: TacticalFactSource;
  confidence: TacticalConfidence;
  baseCooldownSeconds: number;
  adjustedCooldownSeconds: number;
  usedAtSeconds: number;
  readyAtSeconds: number;
  isEnemy: boolean;
  notes?: string;
}

export interface TacticalMemoryPlayerContext {
  championName: string;
  level: number;
  items: Array<{ id: number; name: string }>;
}

export interface TacticalMemoryContext {
  enemyPlayers: TacticalMemoryPlayerContext[];
}

export interface TacticalCommandResult {
  ok: boolean;
  kind: "registered" | "query" | "unknown";
  message: string;
  cooldowns?: ChampionCooldown[];
  facts?: TacticalFact[];
}
