import { mkdir, unlink, writeFile } from "fs/promises";
import os from "os";
import path from "path";

export interface AudioCaptureSession {
  id: string;
  startedAt: number;
  outputPath: string;
}

export interface AudioCaptureServiceOptions {
  tempDir?: string;
  now?: () => number;
}

export class AudioCaptureService {
  private activeSession: AudioCaptureSession | null = null;
  private readonly tempDir: string;
  private readonly now: () => number;
  private sequence = 0;

  constructor(options: AudioCaptureServiceOptions = {}) {
    this.tempDir = options.tempDir ?? os.tmpdir();
    this.now = options.now ?? Date.now;
  }

  async startRecording(): Promise<AudioCaptureSession> {
    if (this.activeSession) {
      throw new Error("gravacao ja esta ativa");
    }

    const startedAt = this.now();
    const sequence = this.sequence++;
    const id = `voice-${startedAt}-${sequence}`;
    const outputPath = path.join(this.tempDir, `${id}.wav`);
    const session = { id, startedAt, outputPath };

    await mkdir(this.tempDir, { recursive: true });
    await writeFile(outputPath, this.createWavStub());
    this.activeSession = session;

    return session;
  }

  async stopRecording(sessionId: string): Promise<{ outputPath: string; durationMs: number }> {
    const session = this.getActiveSession(sessionId);
    this.activeSession = null;

    return {
      outputPath: session.outputPath,
      durationMs: Math.max(0, this.now() - session.startedAt),
    };
  }

  async cancelRecording(sessionId: string): Promise<void> {
    const session = this.getActiveSession(sessionId);
    this.activeSession = null;
    await unlink(session.outputPath).catch(() => {});
  }

  isRecording(): boolean {
    return this.activeSession !== null;
  }

  private getActiveSession(sessionId: string): AudioCaptureSession {
    if (!this.activeSession || this.activeSession.id !== sessionId) {
      throw new Error("gravacao ativa nao encontrada");
    }

    return this.activeSession;
  }

  private createWavStub(): Buffer {
    return Buffer.from("RIFF$\0\0\0WAVEfmt \u0010\0\0\0\u0001\0\u0001\0@\u001f\0\0@\u001f\0\0\u0001\0\b\0data\0\0\0\0", "binary");
  }
}
