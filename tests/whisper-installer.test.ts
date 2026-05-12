import { describe, expect, it } from "vitest";
import os from "os";
import path from "path";
import { mkdtemp, rm, writeFile } from "fs/promises";

describe("whisper-installer", () => {
  const dir = path.join(os.homedir(), ".ferroconfig", "whisper");

  it("exposes a recommended whisper model", async () => {
    const { WHISPER_MODELS } = await import("../src/main/services/whisper-installer.js");
    expect(WHISPER_MODELS[0]).toEqual(expect.objectContaining({
      id: "base-pt-q5_1",
      name: expect.stringContaining("Base"),
      file: expect.stringContaining("ggml"),
      sha256: "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898",
    }));
  });

  it("returns stable install directories", async () => {
    const { getWhisperDir, getWhisperModelsDir } = await import("../src/main/services/whisper-installer.js");
    expect(getWhisperDir()).toBe(dir);
    expect(getWhisperModelsDir()).toBe(path.join(dir, "models"));
  });

  it("rejects unsafe redirect targets", async () => {
    const { resolveTrustedRedirectUrl } = await import("../src/main/services/whisper-installer.js");
    expect(() => resolveTrustedRedirectUrl("https://github.com/release.zip", "http://github.com/release.zip")).toThrow(
      "HTTPS"
    );
    expect(() => resolveTrustedRedirectUrl("https://github.com/release.zip", "https://example.com/release.zip")).toThrow(
      "host"
    );
  });

  it("allows GitHub release asset redirects", async () => {
    const { resolveTrustedRedirectUrl } = await import("../src/main/services/whisper-installer.js");
    const result = resolveTrustedRedirectUrl(
      "https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.6/whisper-bin-x64.zip",
      "https://release-assets.githubusercontent.com/github-production-release-asset/..."
    );
    const url = new URL(result);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("release-assets.githubusercontent.com");
  });

  it("validates zip entries stay inside whisper directory", async () => {
    const { assertSafeZipEntries } = await import("../src/main/services/whisper-installer.js");
    expect(() => assertSafeZipEntries([{ entryName: "bin/whisper-cli.exe" }], dir)).not.toThrow();
    expect(() => assertSafeZipEntries([{ entryName: "../evil.exe" }], dir)).toThrow("Unsafe zip entry");
  });

  it("rejects incomplete downloads before accepting a file", async () => {
    const { assertCompleteDownload } = await import("../src/main/services/whisper-installer.js");
    expect(() => assertCompleteDownload(9, 10)).toThrow("Download incompleto.");
    expect(() => assertCompleteDownload(10, 10)).not.toThrow();
    expect(() => assertCompleteDownload(9, 0)).not.toThrow();
  });

  it("verifies downloaded file checksums", async () => {
    const { verifyFileSha256 } = await import("../src/main/services/whisper-installer.js");
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "ferro-whisper-test-"));
    const filePath = path.join(tempDir, "download.bin");

    try {
      await writeFile(filePath, "ferro");
      await expect(verifyFileSha256(filePath, "127a21fb0573ab7c004b22c663b9a73a66bd1542881bebbadd91081c92d715da")).resolves.toBeUndefined();
      await expect(verifyFileSha256(filePath, "0000000000000000000000000000000000000000000000000000000000000000")).rejects.toThrow("Checksum invalido");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
