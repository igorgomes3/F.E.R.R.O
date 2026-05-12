import { GlobalKeyboardListener } from "node-global-key-listener";
import { unlink } from "fs/promises";
import { IPC } from "../../shared/channels";
import type { FerroConfig, SttResult, VoiceInputStatus, VoiceInputStatusState, VoiceRouteResult, WhisperStatus } from "../../shared/types";
import { AudioCaptureService } from "./audio-capture-service";
import { transcribeWithWhisper, type WhisperTranscribeOptions } from "./stt-service";
import { checkWhisper } from "./whisper-installer";

interface AudioCaptureLike {
  startRecording: () => Promise<{ id: string; outputPath: string; startedAt: number }>;
  stopRecording: (sessionId: string) => Promise<{ outputPath: string; durationMs: number }>;
  cancelRecording: (sessionId: string) => Promise<void>;
}

export interface VoiceInputControllerDeps {
  getConfig: () => Pick<FerroConfig, "voiceInput">;
  checkWhisper?: (executablePath?: string, modelPath?: string) => WhisperStatus;
  capture?: AudioCaptureLike;
  transcribe?: (inputPath: string, options: WhisperTranscribeOptions) => Promise<SttResult>;
  route: (transcript: string) => VoiceRouteResult;
  emit: (type: string, payload: unknown) => void;
}

const CONFIGURATION_ERROR = "Voz nao esta configurada.";
const START_RECORDING_ERROR = "Falha ao iniciar gravacao.";
const PROCESSING_ERROR = "Falha ao processar voz.";
const HOTKEY_CONFLICT_ERROR = "Hotkey de voz em conflito. Escolha outra tecla.";

export class VoiceInputController {
  private readonly getConfig: VoiceInputControllerDeps["getConfig"];
  private readonly checkWhisper: NonNullable<VoiceInputControllerDeps["checkWhisper"]>;
  private readonly capture: AudioCaptureLike;
  private readonly transcribe: NonNullable<VoiceInputControllerDeps["transcribe"]>;
  private readonly route: VoiceInputControllerDeps["route"];
  private readonly emit: VoiceInputControllerDeps["emit"];
  private sessionId: string | null = null;
  private state: VoiceInputStatusState = "disabled";
  private lastTranscript = "";
  private lastResultMessage = "";
  private errorMessage: string | null = null;
  private whisper: WhisperStatus = { executableExists: false, modelExists: false, ready: false, executablePath: "", modelPath: "" };
  private keyboardListener: GlobalKeyboardListener | null = null;
  private isStartingRecording = false;
  private stopAfterStart = false;
  private isPushToTalkActive = false;

  constructor(deps: VoiceInputControllerDeps) {
    this.getConfig = deps.getConfig;
    this.checkWhisper = deps.checkWhisper ?? checkWhisper;
    this.capture = deps.capture ?? new AudioCaptureService();
    this.transcribe = deps.transcribe ?? transcribeWithWhisper;
    this.route = deps.route;
    this.emit = deps.emit;

    this.refreshState();
  }

  getStatus(): VoiceInputStatus {
    const { voiceInput } = this.getConfig();

    return {
      state: this.state,
      enabled: voiceInput.enabled,
      mode: voiceInput.mode,
      pushToTalkHotkey: voiceInput.pushToTalkHotkey,
      toggleHotkey: voiceInput.toggleHotkey,
      whisper: this.whisper,
      lastTranscript: this.lastTranscript,
      lastResultMessage: this.lastResultMessage,
      errorMessage: this.errorMessage,
    };
  }

  async startRecording(): Promise<VoiceInputStatus> {
    if (this.sessionId || this.isStartingRecording) {
      return this.setActiveErrorStatus("Gravacao ja esta ativa.");
    }

    const { voiceInput } = this.getConfig();
    this.whisper = this.checkWhisper(voiceInput.stt.executablePath, voiceInput.stt.modelPath);

    if (!voiceInput.enabled || !this.whisper.ready) {
      return this.setErrorStatus(CONFIGURATION_ERROR);
    }

    let session: { id: string; outputPath: string; startedAt: number };

    try {
      this.isStartingRecording = true;
      this.state = "recording";
      session = await this.capture.startRecording();
    } catch {
      this.sessionId = null;
      this.stopAfterStart = false;
      return this.setErrorStatus(START_RECORDING_ERROR, true);
    } finally {
      this.isStartingRecording = false;
    }

    this.sessionId = session.id;
    this.state = "recording";
    this.errorMessage = null;
    this.emitStatus();

    if (this.stopAfterStart) {
      this.stopAfterStart = false;
      void this.stopRecording();
    }

    return this.getStatus();
  }

  async stopRecording(): Promise<SttResult | VoiceRouteResult> {
    if (!this.sessionId) {
      return this.failRoute("Nenhuma gravacao ativa.");
    }

    const sessionId = this.sessionId;
    this.sessionId = null;
    let recording: { outputPath: string; durationMs: number };

    try {
      recording = await this.capture.stopRecording(sessionId);
    } catch {
      return this.failRoute(PROCESSING_ERROR);
    }

    return this.processRecording(recording);
  }

  beginExternalRecording(): VoiceInputStatus {
    if (this.isActiveState()) {
      return this.setActiveErrorStatus("Gravacao ja esta ativa.");
    }

    const { voiceInput } = this.getConfig();
    this.whisper = this.checkWhisper(voiceInput.stt.executablePath, voiceInput.stt.modelPath);

    if (!voiceInput.enabled || !this.whisper.ready) {
      return this.setErrorStatus(CONFIGURATION_ERROR);
    }

    this.state = "recording";
    this.errorMessage = null;
    this.emitStatus();
    return this.getStatus();
  }

  async processExternalRecording(outputPath: string, durationMs: number): Promise<SttResult | VoiceRouteResult> {
    return this.processRecording({ outputPath, durationMs });
  }

  private async processRecording(recording: { outputPath: string; durationMs: number }): Promise<SttResult | VoiceRouteResult> {
    if (recording.durationMs < 250) {
      await cleanupAudio(recording.outputPath);
      return this.failRoute("Audio curto demais.");
    }

    this.state = "transcribing";
    this.emitStatus();

    const { voiceInput } = this.getConfig();
    let sttResult: SttResult;

    try {
      sttResult = await this.transcribe(recording.outputPath, {
        executablePath: voiceInput.stt.executablePath,
        modelPath: voiceInput.stt.modelPath,
        language: voiceInput.stt.language,
        threads: voiceInput.stt.threads,
      });
    } catch {
      return this.failRoute(PROCESSING_ERROR);
    } finally {
      await cleanupAudio(recording.outputPath);
    }

    if (!sttResult.ok) {
      this.setError(sttResult.message);
      return sttResult;
    }

    this.lastTranscript = sttResult.transcript;
    this.emit(IPC.VOICE_INPUT_TRANSCRIPT_EVENT, sttResult);
    this.state = "routing";
    this.emitStatus();

    let routeResult: VoiceRouteResult;

    try {
      routeResult = this.route(sttResult.transcript);
    } catch {
      return this.failRoute(PROCESSING_ERROR);
    }

    this.lastResultMessage = routeResult.message;
    this.errorMessage = routeResult.ok ? null : routeResult.message;
    this.state = routeResult.ok ? "idle" : "error";
    this.emit(routeResult.ok ? IPC.VOICE_INPUT_RESULT_EVENT : IPC.VOICE_INPUT_ERROR_EVENT, routeResult);
    this.emitStatus();

    return routeResult;
  }

  async cancelRecording(): Promise<VoiceInputStatus> {
    if (this.sessionId) {
      const sessionId = this.sessionId;
      this.sessionId = null;
      await this.capture.cancelRecording(sessionId);
    }

    this.refreshState();
    return this.getStatus();
  }

  async handleToggleHotkey(): Promise<VoiceInputStatus | VoiceRouteResult | SttResult> {
    return this.sessionId ? this.stopRecording() : this.startRecording();
  }

  async handlePushToTalkDown(): Promise<VoiceInputStatus> {
    if (this.sessionId) return this.getStatus();
    return this.startRecording();
  }

  async handlePushToTalkUp(): Promise<VoiceRouteResult | VoiceInputStatus | SttResult> {
    if (this.isStartingRecording) {
      this.stopAfterStart = true;
      return this.getStatus();
    }
    if (!this.sessionId) return this.getStatus();
    return this.stopRecording();
  }

  async registerGlobalHotkeys(): Promise<{ ok: boolean; error?: string }> {
    const { voiceInput } = this.getConfig();

    this.unregisterGlobalHotkeys();

    if (!voiceInput.enabled) return { ok: true };

    try {
      this.keyboardListener = new GlobalKeyboardListener();
      await this.keyboardListener.addListener((event, down) => {
        const current = this.getConfig().voiceInput;

        if (!current.enabled) return;

        if (current.mode === "toggle" && event.state === "DOWN" && matchesHotkey(current.toggleHotkey, event, down as Record<string, boolean>)) {
          void this.requestToggleCapture();
        }

        if (current.mode === "push_to_talk") {
          const isMatch = matchesHotkey(current.pushToTalkHotkey, event, down as Record<string, boolean>);
          if (event.state === "DOWN" && isMatch && !this.isPushToTalkActive) {
            this.isPushToTalkActive = true;
            this.emit(IPC.VOICE_INPUT_CAPTURE_START_REQUEST, { mode: "push_to_talk" });
          }
          if (event.state === "UP" && this.isPushToTalkActive && isHotkeyPart(current.pushToTalkHotkey, event)) {
            this.isPushToTalkActive = false;
            this.emit(IPC.VOICE_INPUT_CAPTURE_STOP_REQUEST, { mode: "push_to_talk" });
          }
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : HOTKEY_CONFLICT_ERROR;
      this.unregisterGlobalHotkeys();
      this.setErrorStatus(HOTKEY_CONFLICT_ERROR);
      return { ok: false, error: message };
    }

    return { ok: true };
  }

  unregisterGlobalHotkeys(): void {
    this.keyboardListener?.kill();
    this.keyboardListener = null;
    this.isPushToTalkActive = false;
  }

  refreshState(): VoiceInputStatus {
    const { voiceInput } = this.getConfig();
    this.whisper = this.checkWhisper(voiceInput.stt.executablePath, voiceInput.stt.modelPath);

    if (!this.isActiveState()) {
      this.state = voiceInput.enabled && this.whisper.ready ? "idle" : "disabled";
    }

    this.emitStatus();

    return this.getStatus();
  }

  private failRoute(message: string): VoiceRouteResult {
    this.setError(message);
    return { ok: false, kind: "error", message };
  }

  private setErrorStatus(message: string, emitError = false): VoiceInputStatus {
    this.errorMessage = message;
    this.lastResultMessage = message;
    this.state = "error";
    if (emitError) {
      this.emit(IPC.VOICE_INPUT_ERROR_EVENT, { ok: false, kind: "error", message });
    }
    this.emitStatus();

    return this.getStatus();
  }

  private setActiveErrorStatus(message: string): VoiceInputStatus {
    this.errorMessage = message;
    this.lastResultMessage = message;
    this.emit(IPC.VOICE_INPUT_ERROR_EVENT, { ok: false, kind: "error", message });
    this.emitStatus();

    return this.getStatus();
  }

  private setError(message: string): void {
    this.errorMessage = message;
    this.lastResultMessage = message;
    this.state = "error";
    this.emit(IPC.VOICE_INPUT_ERROR_EVENT, { ok: false, kind: "error", message });
    this.emitStatus();
  }

  private emitStatus(): void {
    this.emit(IPC.VOICE_INPUT_STATUS_EVENT, this.getStatus());
  }

  private requestToggleCapture(): void {
    if (this.state === "recording") {
      this.emit(IPC.VOICE_INPUT_CAPTURE_STOP_REQUEST, { mode: "toggle" });
      return;
    }
    this.emit(IPC.VOICE_INPUT_CAPTURE_START_REQUEST, { mode: "toggle" });
  }

  private isActiveState(): boolean {
    return this.isStartingRecording || this.state === "recording" || this.state === "transcribing" || this.state === "routing";
  }
}

export function matchesHotkey(hotkey: string, event: { name?: string; state?: string }, down: Record<string, boolean>): boolean {
  const parts = hotkey.toLowerCase().split("+").map((part) => part.trim());
  const modifiers = parts.slice(0, -1);
  const key = parts.at(-1);

  if (!key || modifiers.some((part) => part !== "alt" && part !== "shift")) return false;
  if (hasModifierDown(down, "ctrl") || hasModifierDown(down, "meta")) return false;
  if (modifiers.includes("alt") !== hasModifierDown(down, "alt")) return false;
  if (modifiers.includes("shift") !== hasModifierDown(down, "shift")) return false;

  if (key === "space") return event.name === "SPACE";
  return /^[a-z]$/.test(key) && event.name === key.toUpperCase();
}

function hasModifierDown(down: Record<string, boolean>, modifier: "alt" | "shift" | "ctrl" | "meta"): boolean {
  switch (modifier) {
    case "alt":
      return Boolean(down.LEFT_ALT || down.RIGHT_ALT);
    case "shift":
      return Boolean(down.LEFT_SHIFT || down.RIGHT_SHIFT);
    case "ctrl":
      return Boolean(down.LEFT_CTRL || down.RIGHT_CTRL || down.LEFT_CONTROL || down.RIGHT_CONTROL);
    case "meta":
      return Boolean(down.LEFT_META || down.RIGHT_META || down.LEFT_WIN || down.RIGHT_WIN || down.LEFT_COMMAND || down.RIGHT_COMMAND);
  }
}

function isHotkeyPart(hotkey: string, event: { name?: string }): boolean {
  if (!event.name) return false;

  const parts = hotkey.toLowerCase().split("+").map((part) => part.trim());
  const name = event.name.toUpperCase();

  return parts.some((part) => {
    if (part === "space") return name === "SPACE";
    if (part === "alt") return name === "ALT" || name === "LEFT_ALT" || name === "RIGHT_ALT";
    if (part === "shift") return name === "SHIFT" || name === "LEFT_SHIFT" || name === "RIGHT_SHIFT";
    return /^[a-z]$/.test(part) && name === part.toUpperCase();
  });
}

async function cleanupAudio(outputPath: string): Promise<void> {
  await unlink(outputPath).catch(() => {});
}
