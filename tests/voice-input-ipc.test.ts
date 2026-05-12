import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("voice input IPC surface", () => {
  it("registers main process voice input handlers", () => {
    const source = readFileSync(new URL("../src/main/ipc/handlers.ts", import.meta.url), "utf8");
    expect(source).toContain("VOICE_INPUT_STATUS_GET");
    expect(source).toContain("VOICE_INPUT_INSTALL");
    expect(source).toContain("VOICE_INPUT_TEST_TRANSCRIBE");
    expect(source).toContain("VOICE_INPUT_START_RECORDING");
    expect(source).toContain("VOICE_INPUT_STOP_RECORDING");
    expect(source).toContain("VOICE_INPUT_RECORDING_SAVE");
    expect(source).toContain("VOICE_INPUT_RECORDING_PROCESS");
    expect(source).toContain("MAX_VOICE_RECORDING_BYTES");
    expect(source).toContain("pendingVoiceRecordings");
    expect(source).toContain("isWavRecording");
    expect(source).toContain("resolveVoiceRecordingPath");
    expect(source).toContain("VOICE_INPUT_CAPTURE_CANCEL_REQUEST");
    expect(source).not.toContain("return voiceInput.processExternalRecording(filePath, durationMs)");
    expect(source).toMatch(/setTtsEnabled: \(enabled\) => \{\s*configService\.setPath\("tts\.enabled", enabled\);\s*engine\.syncConfig\(\);\s*emitConfigChanged\(mainWindow, "tts\.enabled", enabled\);\s*\}/);
    expect(source).toContain("const startStatus = await voiceInput.startRecording()");
    expect(source).toContain("if (startStatus.state !== \"recording\") return startStatus");
    expect(source).toContain("await delay(300)");
  });

  it("exposes voice input APIs through preload", () => {
    const source = readFileSync(new URL("../src/preload/index.ts", import.meta.url), "utf8");
    expect(source).toContain("getVoiceInputStatus");
    expect(source).toContain("installWhisper");
    expect(source).toContain("startVoiceRecording");
    expect(source).toContain("stopVoiceRecording");
    expect(source).toContain("saveVoiceRecording");
    expect(source).toContain("processVoiceRecording");
    expect(source).toContain("onVoiceInputStatus");
    expect(source).toContain("onVoiceCaptureStartRequest");
    expect(source).toContain("onVoiceCaptureStopRequest");
  });
});
