import type { TacticalCommandResult, VoiceRouteResult } from "../../shared/types";

interface VoiceCommandDeps {
  resetTacticalMemory: () => void;
  handleTacticalCommand: (text: string) => TacticalCommandResult;
  setTtsEnabled: (enabled: boolean) => void;
  getStatusSummary: () => string;
}

export function routeVoiceCommand(transcript: string, deps: VoiceCommandDeps): VoiceRouteResult {
  const text = transcript.trim().replace(/\s+/g, " ");
  const normalized = normalize(text);

  if (/^(resetar|limpar) memoria$/.test(normalized)) {
    deps.resetTacticalMemory();
    return { ok: true, kind: "app_command", command: "reset_memory", message: "Memoria tatica resetada." };
  }
  if (/^(silenciar|mutar) voz$/.test(normalized)) {
    deps.setTtsEnabled(false);
    return { ok: true, kind: "app_command", command: "mute_tts", message: "Voz de saida silenciada." };
  }
  if (/^ativar voz$/.test(normalized)) {
    deps.setTtsEnabled(true);
    return { ok: true, kind: "app_command", command: "unmute_tts", message: "Voz de saida ativada." };
  }
  if (/^status$/.test(normalized)) {
    return { ok: true, kind: "app_command", command: "status", message: deps.getStatusSummary() };
  }

  const tacticalResult = deps.handleTacticalCommand(text);
  if (!tacticalResult.ok) {
    return { ok: false, kind: "error", message: tacticalResult.message };
  }

  return { ok: true, kind: "tactical_memory", message: tacticalResult.message, tacticalResult };
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
