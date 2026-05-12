import { useEffect, useRef } from "react";
import { VoiceRecorder } from "../../lib/voice-capture";

export default function VoiceInputCaptureBridge() {
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const isStartingRef = useRef(false);
  const stopAfterStartRef = useRef(false);

  useEffect(() => {
    const startCapture = async () => {
      if (recorderRef.current || isStartingRef.current) return;
      const recorder = new VoiceRecorder();
      recorderRef.current = recorder;
      isStartingRef.current = true;

      try {
        await recorder.start();
        isStartingRef.current = false;
        const status = await window.ferroAPI.startVoiceRecording();
        if ((status as { state?: string }).state !== "recording") {
          await recorder.cancel();
          recorderRef.current = null;
          stopAfterStartRef.current = false;
          return;
        }
        if (stopAfterStartRef.current) {
          stopAfterStartRef.current = false;
          await stopCapture();
        }
      } catch {
        isStartingRef.current = false;
        stopAfterStartRef.current = false;
        await recorder.cancel().catch(() => {});
        recorderRef.current = null;
        await window.ferroAPI.cancelVoiceRecording();
      }
    };

    const stopCapture = async () => {
      if (isStartingRef.current) {
        stopAfterStartRef.current = true;
        return;
      }
      const recorder = recorderRef.current;
      if (!recorder) return;
      recorderRef.current = null;
      stopAfterStartRef.current = false;

      try {
        const captured = await recorder.stop();
        const saved = await window.ferroAPI.saveVoiceRecording(captured.audio);
        if (!(saved as { ok?: boolean }).ok) {
          await window.ferroAPI.cancelVoiceRecording();
          return;
        }
        await window.ferroAPI.processVoiceRecording((saved as { filePath: string }).filePath, captured.durationMs);
      } catch {
        await window.ferroAPI.cancelVoiceRecording();
      }
    };

    const cancelCapture = async () => {
      const recorder = recorderRef.current;
      recorderRef.current = null;
      isStartingRef.current = false;
      stopAfterStartRef.current = false;
      await recorder?.cancel().catch(() => {});
      await window.ferroAPI.cancelVoiceRecording();
    };

    const unsubStart = window.ferroAPI.onVoiceCaptureStartRequest(() => { void startCapture(); });
    const unsubStop = window.ferroAPI.onVoiceCaptureStopRequest(() => { void stopCapture(); });
    const unsubCancel = window.ferroAPI.onVoiceCaptureCancelRequest(() => { void cancelCapture(); });

    return () => {
      unsubStart();
      unsubStop();
      unsubCancel();
      void cancelCapture();
    };
  }, []);

  return null;
}
