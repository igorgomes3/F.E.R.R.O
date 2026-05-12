import { describe, expect, it, vi } from "vitest";

describe("VoiceCommandRouter", () => {
  it("routes resetar memoria before tactical memory", async () => {
    const resetTacticalMemory = vi.fn();
    const handleTacticalCommand = vi.fn();
    const { routeVoiceCommand } = await import("../src/main/services/voice-command-router.js");

    const result = routeVoiceCommand("resetar memoria", {
      resetTacticalMemory,
      handleTacticalCommand,
      setTtsEnabled: vi.fn(),
      getStatusSummary: () => "status ok",
    });

    expect(resetTacticalMemory).toHaveBeenCalledTimes(1);
    expect(handleTacticalCommand).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, kind: "app_command", command: "reset_memory", message: "Memoria tatica resetada." });
  });

  it("routes tactical phrases to tactical memory", async () => {
    const tacticalResult = { ok: true, kind: "registered", message: "Ashe flash registrado ate 07:00." } as const;
    const handleTacticalCommand = vi.fn(() => tacticalResult);
    const { routeVoiceCommand } = await import("../src/main/services/voice-command-router.js");

    const result = routeVoiceCommand("Ashe flashou", {
      resetTacticalMemory: vi.fn(),
      handleTacticalCommand,
      setTtsEnabled: vi.fn(),
      getStatusSummary: () => "status ok",
    });

    expect(handleTacticalCommand).toHaveBeenCalledWith("Ashe flashou");
    expect(result).toEqual({ ok: true, kind: "tactical_memory", message: tacticalResult.message, tacticalResult });
  });

  it("routes failed tactical commands as errors", async () => {
    const tacticalResult = { ok: false, kind: "unknown", message: "Comando nao reconhecido." } as const;
    const handleTacticalCommand = vi.fn(() => tacticalResult);
    const { routeVoiceCommand } = await import("../src/main/services/voice-command-router.js");

    const result = routeVoiceCommand("", {
      resetTacticalMemory: vi.fn(),
      handleTacticalCommand,
      setTtsEnabled: vi.fn(),
      getStatusSummary: () => "status ok",
    });

    expect(result).toEqual({ ok: false, kind: "error", message: tacticalResult.message });
  });
});
