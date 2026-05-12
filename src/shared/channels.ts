export const IPC = {
  // Config
  CONFIG_GET: "config:get",
  CONFIG_SET: "config:set",
  CONFIG_RESET: "config:reset",
  CONFIG_CHANGED: "config:changed",

  // Engine
  ENGINE_START: "engine:start",
  ENGINE_STOP: "engine:stop",
  ENGINE_STATUS: "engine:status",
  ENGINE_EVENT: "engine:event",
  TACTICAL_MEMORY_COMMAND: "tactical-memory:command",
  TACTICAL_MEMORY_LIST: "tactical-memory:list",
  TACTICAL_MEMORY_RESET: "tactical-memory:reset",

  // Logs
  LOGS_GET: "logs:get",
  ELEVENLABS_USAGE_GET: "elevenlabs:usage:get",
  LOGS_ENTRY: "logs:entry",
  LOGS_CLEAR: "logs:clear",

  // Match Analysis
  MATCH_LIST: "match:list",
  MATCH_GET: "match:get",
  MATCH_LAST: "match:last",

  // Voice listing
  VOICES_LIST_PIPER: "voices:list-piper",
  VOICES_LIST_ELEVENLABS: "voices:list-elevenlabs",
  VOICES_LIST_SYSTEM: "voices:list-system",

  // TTS
  TTS_TEST: "tts:test",
  TTS_STATUS: "tts:status",

  // LLM
  LLM_TEST: "llm:test",
  LLM_TEST_COACHING: "llm:test-coaching",

  // Piper Installer
  PIPER_INSTALL: "piper:install",
  PIPER_PROGRESS: "piper:progress",
  PIPER_AVAILABLE_VOICES: "piper:available-voices",

  // Voice input
  VOICE_INPUT_STATUS_GET: "voice-input:status:get",
  VOICE_INPUT_SETTINGS_UPDATE: "voice-input:settings:update",
  VOICE_INPUT_INSTALL: "voice-input:install",
  VOICE_INPUT_INSTALL_PROGRESS: "voice-input:install-progress",
  VOICE_INPUT_TEST_TRANSCRIBE: "voice-input:test-transcribe",
  VOICE_INPUT_START_RECORDING: "voice-input:start-recording",
  VOICE_INPUT_STOP_RECORDING: "voice-input:stop-recording",
  VOICE_INPUT_CANCEL_RECORDING: "voice-input:cancel-recording",
  VOICE_INPUT_RECORDING_SAVE: "voice-input:recording:save",
  VOICE_INPUT_RECORDING_PROCESS: "voice-input:recording:process",
  VOICE_INPUT_STATUS_EVENT: "voice-input:status-event",
  VOICE_INPUT_TRANSCRIPT_EVENT: "voice-input:transcript-event",
  VOICE_INPUT_RESULT_EVENT: "voice-input:result-event",
  VOICE_INPUT_ERROR_EVENT: "voice-input:error-event",
  VOICE_INPUT_CAPTURE_START_REQUEST: "voice-input:capture-start-request",
  VOICE_INPUT_CAPTURE_STOP_REQUEST: "voice-input:capture-stop-request",
  VOICE_INPUT_CAPTURE_CANCEL_REQUEST: "voice-input:capture-cancel-request",

  // System
  DIALOG_SELECT_DIR: "dialog:selectDirectory",
  APP_VERSION: "app:version",
  APP_GET_STARTUP_STATE: "app:getStartupState",
  APP_COMPLETE_ONBOARDING: "app:completeOnboarding",
} as const;
