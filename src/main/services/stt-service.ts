import { execFile } from "child_process";
import { existsSync } from "fs";
import { readFile, unlink } from "fs/promises";
import type { SttResult } from "../../shared/types";

export interface WhisperTranscribeOptions {
  executablePath: string;
  modelPath: string;
  language: string;
  threads: number;
  timeoutMs?: number;
}

function normalizeTranscript(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function runWhisper(executablePath: string, args: string[], timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(executablePath, args, { timeout, windowsHide: true }, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function isTimeoutError(error: unknown): boolean {
  const execError = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string | null };
  return execError.code === "ETIMEDOUT" || (execError.killed === true && execError.signal === "SIGTERM");
}

export async function transcribeWithWhisper(inputPath: string, options: WhisperTranscribeOptions): Promise<SttResult> {
  if (!existsSync(options.executablePath)) {
    return { ok: false, errorCode: "missing_executable", message: "whisper.cpp nao encontrado." };
  }

  if (!existsSync(options.modelPath)) {
    return { ok: false, errorCode: "missing_model", message: "Modelo whisper.cpp nao encontrado." };
  }

  if (!existsSync(inputPath)) {
    return { ok: false, errorCode: "empty_audio", message: "Audio vazio ou nao encontrado." };
  }

  const startedAt = Date.now();
  const outputPath = `${inputPath}.transcript`;
  const transcriptPath = `${outputPath}.txt`;
  const threads = Math.max(1, Math.floor(Number.isFinite(options.threads) ? options.threads : 1));
  const args = ["-m", options.modelPath, "-f", inputPath];

  if (options.language !== "auto") {
    args.push("-l", options.language);
  }

  args.push("-t", String(threads), "-of", outputPath, "-otxt");

  try {
    await runWhisper(options.executablePath, args, options.timeoutMs ?? 30000);

    const transcript = normalizeTranscript(await readFile(transcriptPath, "utf8"));
    await unlink(transcriptPath).catch(() => {});

    if (!transcript) {
      return { ok: false, errorCode: "empty_transcript", message: "Nao entendi nenhum comando." };
    }

    return { ok: true, transcript, durationMs: Date.now() - startedAt };
  } catch (error) {
    await unlink(transcriptPath).catch(() => {});

    if (isTimeoutError(error)) {
      return { ok: false, errorCode: "timeout", message: "Transcricao demorou demais." };
    }

    return { ok: false, errorCode: "process_failed", message: "whisper.cpp falhou ao transcrever." };
  }
}
