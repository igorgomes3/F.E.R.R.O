interface CapturedAudio {
  audio: ArrayBuffer;
  durationMs: number;
}

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private sampleRate = 16000;
  private startedAt = 0;

  async start(): Promise<void> {
    if (this.stream) throw new Error("Gravacao ja esta ativa.");

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.context = new AudioContextCtor({ sampleRate: 16000 });
    this.sampleRate = this.context.sampleRate;
    this.source = this.context.createMediaStreamSource(this.stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (event) => {
      this.chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
    this.source.connect(this.processor);
    this.processor.connect(this.context.destination);
    this.startedAt = Date.now();
  }

  async stop(): Promise<CapturedAudio> {
    const durationMs = Math.max(0, Date.now() - this.startedAt);
    const pcm = mergeChunks(this.chunks);
    const audio = encodeWav(pcm, this.sampleRate);
    await this.cleanup();
    return { audio, durationMs };
  }

  async cancel(): Promise<void> {
    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.processor = null;
    this.source = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    await this.context?.close().catch(() => {});
    this.context = null;
    this.chunks = [];
    this.startedAt = 0;
  }
}

export async function recordVoiceInputSample(durationMs = 1500): Promise<unknown> {
  const recorder = new VoiceRecorder();
  await recorder.start();
  const startStatus = await window.ferroAPI.startVoiceRecording();
  if ((startStatus as { state?: string }).state !== "recording") {
    await recorder.cancel();
    return startStatus;
  }

  await delay(durationMs);
  const captured = await recorder.stop();
  const saved = await window.ferroAPI.saveVoiceRecording(captured.audio);
  if (!(saved as { ok?: boolean }).ok) return saved;
  return window.ferroAPI.processVoiceRecording((saved as { filePath: string }).filePath, captured.durationMs);
}

export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }

  return buffer;
}

function mergeChunks(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function writeString(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
