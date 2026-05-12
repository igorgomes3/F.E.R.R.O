import { beforeEach, describe, expect, it, vi } from "vitest";

const exists = vi.fn();
const execFile = vi.fn();
const readFile = vi.fn();
const unlink = vi.fn(async () => {});

vi.mock("fs", () => ({ existsSync: (path: string) => exists(path) }));
vi.mock("fs/promises", () => ({ readFile: (path: string, enc: string) => readFile(path, enc), unlink: (path: string) => unlink(path) }));
vi.mock("child_process", () => ({ execFile: (...args: unknown[]) => execFile(...args) }));

describe("SttService", () => {
  beforeEach(() => {
    vi.resetModules();
    exists.mockReset();
    execFile.mockReset();
    readFile.mockReset();
    unlink.mockClear();
  });

  it("returns missing executable before spawning whisper", async () => {
    exists.mockReturnValue(false);
    const { transcribeWithWhisper } = await import("../src/main/services/stt-service.js");

    const result = await transcribeWithWhisper("audio.wav", {
      executablePath: "missing.exe",
      modelPath: "model.bin",
      language: "pt",
      threads: 4,
    });

    expect(result).toEqual({ ok: false, errorCode: "missing_executable", message: "whisper.cpp nao encontrado." });
    expect(execFile).not.toHaveBeenCalled();
  });

  it("spawns whisper and normalizes transcript output", async () => {
    exists.mockReturnValue(true);
    execFile.mockImplementation((_exe, _args, _opts, cb) => cb(null, "", ""));
    readFile.mockResolvedValue("  Ashe   flashou\n");
    const { transcribeWithWhisper } = await import("../src/main/services/stt-service.js");

    const result = await transcribeWithWhisper("C:/tmp/audio.wav", {
      executablePath: "C:/whisper/whisper-cli.exe",
      modelPath: "C:/models/ggml-base.bin",
      language: "pt",
      threads: 4,
    });

    expect(execFile).toHaveBeenCalledWith(
      "C:/whisper/whisper-cli.exe",
      expect.arrayContaining(["-m", "C:/models/ggml-base.bin", "-f", "C:/tmp/audio.wav", "-l", "pt", "-t", "4", "-otxt"]),
      expect.objectContaining({ timeout: 30000 }),
      expect.any(Function),
    );
    expect(result).toEqual({ ok: true, transcript: "Ashe flashou", durationMs: expect.any(Number) });
  });

  it("returns empty_transcript when whisper writes no text", async () => {
    exists.mockReturnValue(true);
    execFile.mockImplementation((_exe, _args, _opts, cb) => cb(null, "", ""));
    readFile.mockResolvedValue("   ");
    const { transcribeWithWhisper } = await import("../src/main/services/stt-service.js");

    const result = await transcribeWithWhisper("audio.wav", {
      executablePath: "whisper-cli.exe",
      modelPath: "model.bin",
      language: "pt",
      threads: 4,
    });

    expect(result).toEqual({ ok: false, errorCode: "empty_transcript", message: "Nao entendi nenhum comando." });
  });

  it("returns timeout when execFile kills whisper after timeout", async () => {
    exists.mockReturnValue(true);
    execFile.mockImplementation((_exe, _args, _opts, cb) => cb({ killed: true, signal: "SIGTERM", code: null }, "", ""));
    const { transcribeWithWhisper } = await import("../src/main/services/stt-service.js");

    const result = await transcribeWithWhisper("audio.wav", {
      executablePath: "whisper-cli.exe",
      modelPath: "model.bin",
      language: "pt",
      threads: 4,
    });

    expect(result).toEqual({ ok: false, errorCode: "timeout", message: "Transcricao demorou demais." });
  });
});
