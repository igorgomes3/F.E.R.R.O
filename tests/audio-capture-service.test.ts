import { mkdtemp, rm, unlink } from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";

async function createTempDir() {
  return mkdtemp(path.join(os.tmpdir(), "ferro-audio-"));
}

describe("AudioCaptureService", () => {
  it("prevents overlapping recordings", async () => {
    const { AudioCaptureService } = await import("../src/main/services/audio-capture-service.js");
    const tempDir = await createTempDir();
    const capture = new AudioCaptureService({ tempDir });

    try {
      const session = await capture.startRecording();
      await expect(capture.startRecording()).rejects.toThrow("gravacao ja esta ativa");
      await capture.cancelRecording(session.id);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("returns duration and output path when stopping", async () => {
    const { AudioCaptureService } = await import("../src/main/services/audio-capture-service.js");
    const tempDir = await createTempDir();
    const capture = new AudioCaptureService({ tempDir, now: (() => {
      let time = 1000;
      return () => { time += 750; return time; };
    })() });

    try {
      const session = await capture.startRecording();
      const result = await capture.stopRecording(session.id);

      expect(result.outputPath).toBe(session.outputPath);
      expect(result.durationMs).toBe(750);
      await unlink(result.outputPath);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("uses unique paths for sequential recordings with the same clock", async () => {
    const { AudioCaptureService } = await import("../src/main/services/audio-capture-service.js");
    const tempDir = await createTempDir();
    const capture = new AudioCaptureService({ tempDir, now: () => 1000 });

    try {
      const firstSession = await capture.startRecording();
      await capture.stopRecording(firstSession.id);
      const secondSession = await capture.startRecording();
      await capture.stopRecording(secondSession.id);

      expect(secondSession.id).not.toBe(firstSession.id);
      expect(secondSession.outputPath).not.toBe(firstSession.outputPath);
      await unlink(firstSession.outputPath);
      await unlink(secondSession.outputPath);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
