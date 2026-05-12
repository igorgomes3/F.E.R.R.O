import { describe, expect, it, vi } from "vitest";
import type { VoiceInputController } from "../src/main/services/voice-input-controller";

const keyboardListeners: MockKeyboardListener[] = [];

class MockKeyboardListener {
  static nextAddListener: (() => Promise<void>) | null = null;
  listener: ((event: { name?: string; state?: string }, down: Record<string, boolean>) => void) | null = null;
  addListener = vi.fn(async (listener: (event: { name?: string; state?: string }, down: Record<string, boolean>) => void) => {
    this.listener = listener;
    await MockKeyboardListener.nextAddListener?.();
  });
  kill = vi.fn();

  constructor() {
    keyboardListeners.push(this);
  }
}

vi.mock("node-global-key-listener", () => ({
  GlobalKeyboardListener: MockKeyboardListener,
}));

type VoiceInputControllerDeps = ConstructorParameters<typeof VoiceInputController>[0];

function makeDeps(overrides: Partial<VoiceInputControllerDeps> = {}): VoiceInputControllerDeps {
  return {
    getConfig: vi.fn(() => ({
      voiceInput: {
        enabled: true,
        mode: "push_to_talk",
        pushToTalkHotkey: "Alt+Space",
        toggleHotkey: "Alt+Shift+Space",
        stt: { provider: "whisper_cpp", executablePath: "whisper.exe", modelPath: "model.bin", language: "pt", threads: 4 },
      },
    })),
    checkWhisper: vi.fn(() => ({ executableExists: true, modelExists: true, ready: true, executablePath: "whisper.exe", modelPath: "model.bin" })),
    capture: {
      startRecording: vi.fn(async () => ({ id: "s1", outputPath: "audio.wav", startedAt: 1778544000000 })),
      stopRecording: vi.fn(async () => ({ outputPath: "audio.wav", durationMs: 1000 })),
      cancelRecording: vi.fn(async () => {}),
    },
    transcribe: vi.fn(async () => ({ ok: true, transcript: "Ashe flashou", durationMs: 20 })),
    route: vi.fn(() => ({ ok: true, kind: "tactical_memory", message: "Anotado.", tacticalResult: { ok: true, kind: "registered", message: "Anotado." } })),
    emit: vi.fn(),
    ...overrides,
  };
}

describe("VoiceInputController", () => {
  it("records, transcribes, routes, and updates status", async () => {
    const { VoiceInputController } = await import("../src/main/services/voice-input-controller.js");
    const deps = makeDeps();
    const controller = new VoiceInputController(deps);

    await controller.startRecording();
    const result = await controller.stopRecording();

    expect(deps.transcribe).toHaveBeenCalledWith("audio.wav", expect.objectContaining({ executablePath: "whisper.exe", modelPath: "model.bin" }));
    expect(deps.route).toHaveBeenCalledWith("Ashe flashou");
    expect(result.message).toBe("Anotado.");
    expect(deps.emit).toHaveBeenCalledWith("voice-input:result-event", result);
    expect(controller.getStatus()).toEqual(expect.objectContaining({
      state: "idle",
      lastTranscript: "Ashe flashou",
      lastResultMessage: "Anotado.",
      errorMessage: null,
    }));
  });

  it("does not route when STT returns an error", async () => {
    const { VoiceInputController } = await import("../src/main/services/voice-input-controller.js");
    const deps = makeDeps({ transcribe: vi.fn(async () => ({ ok: false, errorCode: "empty_transcript", message: "Nao entendi nenhum comando." })) });
    const controller = new VoiceInputController(deps);

    await controller.startRecording();
    const result = await controller.stopRecording();

    expect(deps.route).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(deps.emit).toHaveBeenCalledWith("voice-input:error-event", { ok: false, kind: "error", message: "Nao entendi nenhum comando." });
    expect(deps.emit).toHaveBeenCalledWith("voice-input:status-event", expect.objectContaining({ state: "error", errorMessage: "Nao entendi nenhum comando." }));
    expect(controller.getStatus()).toEqual(expect.objectContaining({
      state: "error",
      lastResultMessage: "Nao entendi nenhum comando.",
      errorMessage: "Nao entendi nenhum comando.",
    }));
  });

  it("returns error status when voice input is not configured", async () => {
    const { VoiceInputController } = await import("../src/main/services/voice-input-controller.js");
    const deps = makeDeps({
      checkWhisper: vi.fn(() => ({ executableExists: false, modelExists: false, ready: false, executablePath: "whisper.exe", modelPath: "model.bin" })),
    });
    const controller = new VoiceInputController(deps);

    const result = await controller.startRecording();

    expect(deps.capture.startRecording).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ state: "error", errorMessage: "Voz nao esta configurada." }));
    expect(deps.emit).toHaveBeenCalledWith("voice-input:status-event", expect.objectContaining({ state: "error", errorMessage: "Voz nao esta configurada." }));
  });

  it("rejects duplicate start while a recording is active", async () => {
    const { VoiceInputController } = await import("../src/main/services/voice-input-controller.js");
    const deps = makeDeps();
    const controller = new VoiceInputController(deps);

    await controller.startRecording();
    const result = await controller.startRecording();

    expect(deps.capture.startRecording).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({ state: "recording", errorMessage: "Gravacao ja esta ativa." }));
    expect(controller.getStatus()).toEqual(expect.objectContaining({ state: "recording", errorMessage: "Gravacao ja esta ativa." }));
    expect(deps.emit).toHaveBeenCalledWith("voice-input:error-event", { ok: false, kind: "error", message: "Gravacao ja esta ativa." });
  });

  it("rejects duplicate start while recording startup is pending", async () => {
    const { VoiceInputController } = await import("../src/main/services/voice-input-controller.js");
    let resolveStart: ((session: { id: string; outputPath: string; startedAt: number }) => void) | null = null;
    const deps = makeDeps({
      capture: {
        startRecording: vi.fn(() => new Promise((resolve) => { resolveStart = resolve; })),
        stopRecording: vi.fn(async () => ({ outputPath: "audio.wav", durationMs: 1000 })),
        cancelRecording: vi.fn(async () => {}),
      },
    });
    const controller = new VoiceInputController(deps);

    const pending = controller.startRecording();
    const duplicate = await controller.startRecording();
    resolveStart?.({ id: "s1", outputPath: "audio.wav", startedAt: 1778544000000 });
    await pending;

    expect(deps.capture.startRecording).toHaveBeenCalledTimes(1);
    expect(duplicate).toEqual(expect.objectContaining({ state: "recording", errorMessage: "Gravacao ja esta ativa." }));
  });

  it("toggle hotkey starts then stops recording", async () => {
    const { VoiceInputController } = await import("../src/main/services/voice-input-controller.js");
    const deps = makeDeps();
    const controller = new VoiceInputController(deps);

    await controller.handleToggleHotkey();
    expect(controller.getStatus().state).toBe("recording");
    await controller.handleToggleHotkey();

    expect(deps.route).toHaveBeenCalledWith("Ashe flashou");
  });

  it("push-to-talk release stops recording", async () => {
    const { VoiceInputController } = await import("../src/main/services/voice-input-controller.js");
    const deps = makeDeps();
    const controller = new VoiceInputController(deps);

    await controller.handlePushToTalkDown();
    expect(controller.getStatus().state).toBe("recording");
    await controller.handlePushToTalkUp();

    expect(deps.route).toHaveBeenCalledWith("Ashe flashou");
  });

  it("push-to-talk release during startup stops after recording starts", async () => {
    const { VoiceInputController } = await import("../src/main/services/voice-input-controller.js");
    let resolveStart: ((session: { id: string; outputPath: string; startedAt: number }) => void) | null = null;
    const deps = makeDeps({
      capture: {
        startRecording: vi.fn(() => new Promise((resolve) => { resolveStart = resolve; })),
        stopRecording: vi.fn(async () => ({ outputPath: "audio.wav", durationMs: 1000 })),
        cancelRecording: vi.fn(async () => {}),
      },
    });
    const controller = new VoiceInputController(deps);

    const pendingDown = controller.handlePushToTalkDown();
    await controller.handlePushToTalkUp();
    resolveStart?.({ id: "s1", outputPath: "audio.wav", startedAt: 1778544000000 });
    await pendingDown;

    await vi.waitFor(() => expect(deps.route).toHaveBeenCalledWith("Ashe flashou"));
    expect(deps.capture.stopRecording).toHaveBeenCalledWith("s1");
  });

  it("push-to-talk release during failed startup does not stop the next recording", async () => {
    const { VoiceInputController } = await import("../src/main/services/voice-input-controller.js");
    let rejectStart: ((error: Error) => void) | null = null;
    const deps = makeDeps({
      capture: {
        startRecording: vi.fn()
          .mockImplementationOnce(() => new Promise((_, reject) => { rejectStart = reject; }))
          .mockResolvedValueOnce({ id: "s2", outputPath: "audio.wav", startedAt: 1778544000001 }),
        stopRecording: vi.fn(async () => ({ outputPath: "audio.wav", durationMs: 1000 })),
        cancelRecording: vi.fn(async () => {}),
      },
    });
    const controller = new VoiceInputController(deps);

    const failedStart = controller.handlePushToTalkDown();
    await controller.handlePushToTalkUp();
    rejectStart?.(new Error("mic failed"));
    await failedStart;

    const retry = await controller.handlePushToTalkDown();
    await Promise.resolve();

    expect(retry.state).toBe("recording");
    expect(deps.capture.stopRecording).not.toHaveBeenCalled();
  });

  it("push-to-talk requests stop when a held chord is broken by modifier release", async () => {
    const { VoiceInputController } = await import("../src/main/services/voice-input-controller.js");
    const deps = makeDeps();
    const controller = new VoiceInputController(deps);
    keyboardListeners.length = 0;

    await controller.registerGlobalHotkeys();
    keyboardListeners[0]?.listener?.({ name: "SPACE", state: "DOWN" }, { LEFT_ALT: true, SPACE: true });
    keyboardListeners[0]?.listener?.({ name: "LEFT_ALT", state: "UP" }, { LEFT_ALT: false, SPACE: true });

    expect(deps.emit).toHaveBeenCalledWith("voice-input:capture-start-request", { mode: "push_to_talk" });
    expect(deps.emit).toHaveBeenCalledWith("voice-input:capture-stop-request", { mode: "push_to_talk" });
  });

  it("global push-to-talk hotkeys request renderer capture", async () => {
    const { VoiceInputController } = await import("../src/main/services/voice-input-controller.js");
    const deps = makeDeps();
    const controller = new VoiceInputController(deps);
    keyboardListeners.length = 0;

    await controller.registerGlobalHotkeys();
    keyboardListeners[0]?.listener?.({ name: "SPACE", state: "DOWN" }, { LEFT_ALT: true, SPACE: true });
    keyboardListeners[0]?.listener?.({ name: "SPACE", state: "UP" }, { LEFT_ALT: true, SPACE: false });

    expect(deps.capture.startRecording).not.toHaveBeenCalled();
    expect(deps.emit).toHaveBeenCalledWith("voice-input:capture-start-request", { mode: "push_to_talk" });
    expect(deps.emit).toHaveBeenCalledWith("voice-input:capture-stop-request", { mode: "push_to_talk" });
  });

  it("reports hotkey registration failures", async () => {
    const { VoiceInputController } = await import("../src/main/services/voice-input-controller.js");
    const deps = makeDeps();
    const controller = new VoiceInputController(deps);
    keyboardListeners.length = 0;
    MockKeyboardListener.nextAddListener = async () => { throw new Error("busy"); };

    const result = await controller.registerGlobalHotkeys();

    expect(result).toEqual({ ok: false, error: "busy" });
    expect(keyboardListeners[0]?.kill).toHaveBeenCalled();
    expect(controller.getStatus()).toEqual(expect.objectContaining({ state: "error", errorMessage: "Hotkey de voz em conflito. Escolha outra tecla." }));
    MockKeyboardListener.nextAddListener = null;
  });

  it("returns error status when capture start fails", async () => {
    const { VoiceInputController } = await import("../src/main/services/voice-input-controller.js");
    const deps = makeDeps({
      capture: {
        startRecording: vi.fn(async () => { throw new Error("mic failed"); }),
        stopRecording: vi.fn(async () => ({ outputPath: "audio.wav", durationMs: 1000 })),
        cancelRecording: vi.fn(async () => {}),
      },
    });
    const controller = new VoiceInputController(deps);

    const result = await controller.startRecording();

    expect(result).toEqual(expect.objectContaining({ state: "error", errorMessage: "Falha ao iniciar gravacao." }));
    expect(deps.emit).toHaveBeenCalledWith("voice-input:error-event", { ok: false, kind: "error", message: "Falha ao iniciar gravacao." });
    expect(deps.emit).toHaveBeenCalledWith("voice-input:status-event", expect.objectContaining({ state: "error", errorMessage: "Falha ao iniciar gravacao." }));
  });

  it("returns a route error when transcription rejects", async () => {
    const { VoiceInputController } = await import("../src/main/services/voice-input-controller.js");
    const deps = makeDeps({ transcribe: vi.fn(async () => { throw new Error("boom"); }) });
    const controller = new VoiceInputController(deps);

    await controller.startRecording();
    const result = await controller.stopRecording();

    expect(result).toEqual({ ok: false, kind: "error", message: "Falha ao processar voz." });
    expect(deps.route).not.toHaveBeenCalled();
    expect(deps.emit).toHaveBeenCalledWith("voice-input:error-event", { ok: false, kind: "error", message: "Falha ao processar voz." });
    expect(controller.getStatus()).toEqual(expect.objectContaining({ state: "error", errorMessage: "Falha ao processar voz." }));
  });

  it("preserves active state when refreshing", async () => {
    const { VoiceInputController } = await import("../src/main/services/voice-input-controller.js");
    const deps = makeDeps();
    const controller = new VoiceInputController(deps);

    await controller.startRecording();
    const result = controller.refreshState();

    expect(result.state).toBe("recording");
  });
});

describe("matchesHotkey", () => {
  it("matches supported keys and configured modifiers exactly", async () => {
    const { matchesHotkey } = await import("../src/main/services/voice-input-controller.js");

    expect(matchesHotkey("Alt+V", { name: "V", state: "DOWN" }, { LEFT_ALT: true })).toBe(true);
    expect(matchesHotkey("Alt+V", { name: "V", state: "DOWN" }, { LEFT_ALT: true, LEFT_SHIFT: true })).toBe(false);
    expect(matchesHotkey("Alt+V", { name: "V", state: "DOWN" }, { LEFT_ALT: true, LEFT_CTRL: true })).toBe(false);
    expect(matchesHotkey("Alt+V", { name: "V", state: "DOWN" }, { LEFT_ALT: true, LEFT_META: true })).toBe(false);
    expect(matchesHotkey("Alt+Shift+Space", { name: "SPACE", state: "DOWN" }, { LEFT_ALT: true, RIGHT_SHIFT: true })).toBe(true);
    expect(matchesHotkey("Alt+Shift+Space", { name: "V", state: "DOWN" }, { LEFT_ALT: true, RIGHT_SHIFT: true })).toBe(false);
    expect(matchesHotkey("Ctrl+Space", { name: "SPACE", state: "DOWN" }, { LEFT_CTRL: true })).toBe(false);
    expect(matchesHotkey("Meta+Space", { name: "SPACE", state: "DOWN" }, { LEFT_META: true })).toBe(false);
  });
});
