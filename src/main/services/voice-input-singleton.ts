import type { VoiceInputController } from "./voice-input-controller";

let voiceInputController: VoiceInputController | null = null;

export function setVoiceInputController(controller: VoiceInputController): void {
  voiceInputController?.unregisterGlobalHotkeys();
  voiceInputController = controller;
}

export function getVoiceInputController(): VoiceInputController | null {
  return voiceInputController;
}
