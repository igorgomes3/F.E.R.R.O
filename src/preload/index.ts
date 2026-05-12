import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../shared/channels";

function sub(channel: string, cb: (...args: unknown[]) => void) {
  const handler = (_e: Electron.IpcRendererEvent, ...args: unknown[]) => cb(...args);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api = {
  // Config
  getConfig: () => ipcRenderer.invoke(IPC.CONFIG_GET),
  setConfig: (path: string, value: unknown) => ipcRenderer.invoke(IPC.CONFIG_SET, path, value),
  resetConfig: () => ipcRenderer.invoke(IPC.CONFIG_RESET),
  onConfigChanged: (cb: (data: unknown) => void) => sub(IPC.CONFIG_CHANGED, cb),

  // Engine
  startEngine: () => ipcRenderer.invoke(IPC.ENGINE_START),
  stopEngine: () => ipcRenderer.invoke(IPC.ENGINE_STOP),
  getEngineStatus: () => ipcRenderer.invoke(IPC.ENGINE_STATUS),
  onEngineEvent: (cb: (data: unknown) => void) => sub(IPC.ENGINE_EVENT, cb),
  sendTacticalCommand: (text: string) => ipcRenderer.invoke(IPC.TACTICAL_MEMORY_COMMAND, text),
  listTacticalCooldowns: () => ipcRenderer.invoke(IPC.TACTICAL_MEMORY_LIST),
  resetTacticalMemory: () => ipcRenderer.invoke(IPC.TACTICAL_MEMORY_RESET),

  // Logs
  getLogs: (count: number) => ipcRenderer.invoke(IPC.LOGS_GET, count),
  getElevenLabsUsageSummary: () => ipcRenderer.invoke(IPC.ELEVENLABS_USAGE_GET),
  onLogEntry: (cb: (entry: unknown) => void) => sub(IPC.LOGS_ENTRY, cb),
  clearLogs: () => ipcRenderer.invoke(IPC.LOGS_CLEAR),

  // Match
  listSessions: () => ipcRenderer.invoke(IPC.MATCH_LIST),
  getSession: (sessionId: string) => ipcRenderer.invoke(IPC.MATCH_GET, sessionId),
  getLastMatch: () => ipcRenderer.invoke(IPC.MATCH_LAST),

  // Voice listing
  listPiperVoices: () => ipcRenderer.invoke(IPC.VOICES_LIST_PIPER),
  listElevenLabsVoices: (apiKey: string) => ipcRenderer.invoke(IPC.VOICES_LIST_ELEVENLABS, apiKey),
  listSystemVoices: () => ipcRenderer.invoke(IPC.VOICES_LIST_SYSTEM),

  // TTS / LLM
  testTTS: (provider: string, text: string) => ipcRenderer.invoke(IPC.TTS_TEST, provider, text),
  testLLM: (provider: string) => ipcRenderer.invoke(IPC.LLM_TEST, provider),
  testLLMCoaching: () => ipcRenderer.invoke(IPC.LLM_TEST_COACHING),

  // Piper
  getAvailablePiperVoices: () => ipcRenderer.invoke(IPC.PIPER_AVAILABLE_VOICES),
  installPiper: (voiceId: string) => ipcRenderer.invoke(IPC.PIPER_INSTALL, voiceId),
  onPiperProgress: (cb: (data: unknown) => void) => sub(IPC.PIPER_PROGRESS, cb),

  // Voice input
  getVoiceInputStatus: () => ipcRenderer.invoke(IPC.VOICE_INPUT_STATUS_GET),
  updateVoiceInputSetting: (path: string, value: unknown) => ipcRenderer.invoke(IPC.VOICE_INPUT_SETTINGS_UPDATE, path, value),
  installWhisper: () => ipcRenderer.invoke(IPC.VOICE_INPUT_INSTALL),
  testVoiceTranscription: () => ipcRenderer.invoke(IPC.VOICE_INPUT_TEST_TRANSCRIBE),
  startVoiceRecording: () => ipcRenderer.invoke(IPC.VOICE_INPUT_START_RECORDING),
  stopVoiceRecording: () => ipcRenderer.invoke(IPC.VOICE_INPUT_STOP_RECORDING),
  cancelVoiceRecording: () => ipcRenderer.invoke(IPC.VOICE_INPUT_CANCEL_RECORDING),
  saveVoiceRecording: (audio: ArrayBuffer) => ipcRenderer.invoke(IPC.VOICE_INPUT_RECORDING_SAVE, audio),
  processVoiceRecording: (filePath: string, durationMs: number) => ipcRenderer.invoke(IPC.VOICE_INPUT_RECORDING_PROCESS, filePath, durationMs),
  onVoiceInputStatus: (cb: (data: unknown) => void) => sub(IPC.VOICE_INPUT_STATUS_EVENT, cb),
  onVoiceInputTranscript: (cb: (data: unknown) => void) => sub(IPC.VOICE_INPUT_TRANSCRIPT_EVENT, cb),
  onVoiceInputResult: (cb: (data: unknown) => void) => sub(IPC.VOICE_INPUT_RESULT_EVENT, cb),
  onVoiceInputError: (cb: (data: unknown) => void) => sub(IPC.VOICE_INPUT_ERROR_EVENT, cb),
  onVoiceCaptureStartRequest: (cb: (data: unknown) => void) => sub(IPC.VOICE_INPUT_CAPTURE_START_REQUEST, cb),
  onVoiceCaptureStopRequest: (cb: (data: unknown) => void) => sub(IPC.VOICE_INPUT_CAPTURE_STOP_REQUEST, cb),
  onVoiceCaptureCancelRequest: (cb: (data: unknown) => void) => sub(IPC.VOICE_INPUT_CAPTURE_CANCEL_REQUEST, cb),
  onWhisperProgress: (cb: (data: unknown) => void) => sub(IPC.VOICE_INPUT_INSTALL_PROGRESS, cb),

  // System
  selectDirectory: () => ipcRenderer.invoke(IPC.DIALOG_SELECT_DIR),
  getAppVersion: () => ipcRenderer.invoke(IPC.APP_VERSION),
  getStartupState: () => ipcRenderer.invoke(IPC.APP_GET_STARTUP_STATE),
  completeOnboarding: () => ipcRenderer.invoke(IPC.APP_COMPLETE_ONBOARDING),
};

export type FerroAPI = typeof api;

contextBridge.exposeInMainWorld("ferroAPI", api);
