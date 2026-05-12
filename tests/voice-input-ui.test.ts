import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("voice input UI", () => {
  it("renders voice input settings controls", () => {
    const source = readFileSync(new URL("../src/renderer/components/settings/VoiceInputPanel.tsx", import.meta.url), "utf8");
    expect(source).toContain("Entrada por voz");
    expect(source).toContain("installWhisper");
    expect(source).toContain("updateVoiceInputSetting");
    expect(source).not.toContain("onUpdate");
    expect(source).toContain("Push-to-talk");
    expect(source).toContain("Toggle");
    expect(source).toContain("recordVoiceInputSample");
    expect(source).toContain("getTestMessage");
    expect(source).not.toContain("setStatus(result)");
    expect(source).toContain('aria-label="Habilitar entrada por voz"');
    expect(source).toContain("onBlur");
    expect(source).toContain("onKeyDown");
  });

  it("commits text drafts once when Enter blurs the input", () => {
    const source = readFileSync(new URL("../src/renderer/components/settings/VoiceInputPanel.tsx", import.meta.url), "utf8");
    const enterHandler = source.match(/const commitOnEnter[\s\S]*?\n  };/)?.[0] ?? "";
    expect(enterHandler).toContain("blur()");
    expect(enterHandler).not.toContain("commit()");
  });

  it("renders voice input settings from Settings", () => {
    const source = readFileSync(new URL("../src/renderer/pages/Settings.tsx", import.meta.url), "utf8");
    expect(source).toContain("VoiceInputPanel");
    expect(source).toContain("<VoiceInputPanel config={config} />");
  });

  it("renders voice input status on dashboard", () => {
    const source = readFileSync(new URL("../src/renderer/components/dashboard/VoiceInputStatusPanel.tsx", import.meta.url), "utf8");
    expect(source).toContain("Voz");
    expect(source).toContain("lastTranscript");
    expect(source).toContain("lastResultMessage");
  });

  it("renders voice input status from Dashboard", () => {
    const source = readFileSync(new URL("../src/renderer/pages/Dashboard.tsx", import.meta.url), "utf8");
    expect(source).toContain("VoiceInputStatusPanel");
    expect(source).toContain("<VoiceInputStatusPanel />");
  });

  it("mounts a renderer microphone capture bridge", () => {
    const appSource = readFileSync(new URL("../src/renderer/App.tsx", import.meta.url), "utf8");
    const bridgeSource = readFileSync(new URL("../src/renderer/components/voice/VoiceInputCaptureBridge.tsx", import.meta.url), "utf8");
    const captureSource = readFileSync(new URL("../src/renderer/lib/voice-capture.ts", import.meta.url), "utf8");

    expect(appSource).toContain("VoiceInputCaptureBridge");
    expect(bridgeSource).toContain("onVoiceCaptureStartRequest");
    expect(bridgeSource).toContain("saveVoiceRecording");
    expect(bridgeSource).toContain("processVoiceRecording");
    expect(bridgeSource).toContain("isStartingRef");
    expect(bridgeSource).toContain("stopAfterStartRef");
    expect(bridgeSource).toContain("onVoiceCaptureCancelRequest");
    expect(bridgeSource).not.toContain("onVoiceInputError");
    expect(captureSource).toContain("getUserMedia");
    expect(captureSource).toContain("AudioContext");
    expect(captureSource).toContain("encodeWav");
  });
});
