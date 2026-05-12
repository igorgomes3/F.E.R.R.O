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

  // System
  selectDirectory: () => ipcRenderer.invoke(IPC.DIALOG_SELECT_DIR),
  getAppVersion: () => ipcRenderer.invoke(IPC.APP_VERSION),
  getStartupState: () => ipcRenderer.invoke(IPC.APP_GET_STARTUP_STATE),
  completeOnboarding: () => ipcRenderer.invoke(IPC.APP_COMPLETE_ONBOARDING),
};

export type FerroAPI = typeof api;

contextBridge.exposeInMainWorld("ferroAPI", api);
