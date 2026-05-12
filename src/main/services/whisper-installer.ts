import { existsSync, createReadStream, createWriteStream } from "fs";
import { mkdir, rename, unlink } from "fs/promises";
import path from "path";
import os from "os";
import https from "https";
import http from "http";
import { createHash } from "crypto";
import type { BrowserWindow } from "electron";
import { IPC } from "../../shared/channels";
import type { WhisperStatus } from "../../shared/types";

const FERROCONFIG_DIR = path.join(os.homedir(), ".ferroconfig");
const WHISPER_DIR = path.join(FERROCONFIG_DIR, "whisper");
const WHISPER_MODELS_DIR = path.join(WHISPER_DIR, "models");
export const WHISPER_EXE = path.join(WHISPER_DIR, "whisper-cli.exe");

const WHISPER_BINARY_URL =
  "https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.6/whisper-bin-x64.zip";
const WHISPER_BINARY_SHA256 = "0d2eca299c248f965bd0341bcb219db4b433c7f0c0ce2200d4df85765e8156a9";
const MAX_REDIRECTS = 5;
const TRUSTED_REDIRECT_HOSTS = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
  "huggingface.co",
  "cdn-lfs.huggingface.co",
  "cas-bridge.xethub.hf.co",
  "transfer.xethub.hf.co",
]);

export const WHISPER_MODELS = [
  {
    id: "base-pt-q5_1",
    name: "Base PT-BR q5_1 (recomendado)",
    file: "ggml-base-q5_1.bin",
    size: "60MB",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin",
    sha256: "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898",
  },
];

export function getWhisperDir() {
  return WHISPER_DIR;
}

export function getWhisperModelsDir() {
  return WHISPER_MODELS_DIR;
}

export function checkWhisper(executablePath = WHISPER_EXE, modelPath = ""): WhisperStatus {
  const executableExists = existsSync(executablePath);
  const modelExists = modelPath !== "" && existsSync(modelPath);
  return {
    executableExists,
    modelExists,
    ready: executableExists && modelExists,
    executablePath,
    modelPath,
  };
}

export function resolveTrustedRedirectUrl(currentUrl: string, location: string): string {
  const nextUrl = new URL(location, currentUrl);
  if (nextUrl.protocol !== "https:") {
    throw new Error(`Redirect must use HTTPS: ${nextUrl.href}`);
  }
  if (!TRUSTED_REDIRECT_HOSTS.has(nextUrl.hostname)) {
    throw new Error(`Redirect host is not trusted: ${nextUrl.hostname}`);
  }
  return nextUrl.href;
}

export function assertSafeZipEntries(entries: Array<{ entryName: string }>, targetDir = WHISPER_DIR): void {
  const root = path.resolve(targetDir);
  for (const entry of entries) {
    const targetPath = path.resolve(root, entry.entryName);
    if (targetPath !== root && !targetPath.startsWith(root + path.sep)) {
      throw new Error(`Unsafe zip entry: ${entry.entryName}`);
    }
  }
}

export function assertCompleteDownload(downloaded: number, totalBytes: number): void {
  if (totalBytes > 0 && downloaded !== totalBytes) {
    throw new Error("Download incompleto.");
  }
}

export async function verifyFileSha256(filePath: string, expectedSha256: string): Promise<void> {
  const actual = await hashFileSha256(filePath);
  if (actual !== expectedSha256.toLowerCase()) {
    throw new Error("Checksum invalido no download.");
  }
}

function downloadFile(url: string, destPath: string, onProgress?: (percent: number) => void, expectedSha256?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tempPath = `${destPath}.tmp-${process.pid}-${Date.now()}`;
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      unlink(tempPath).catch(() => {});
      reject(err);
    };
    const follow = (currentUrl: string, redirects = 0) => {
      const client = currentUrl.startsWith("https") ? https : http;
      const request = client.get(currentUrl, { headers: { "User-Agent": "FerroConfig/1.0" } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirects >= MAX_REDIRECTS) {
            fail(new Error(`Too many redirects downloading ${url}`));
            return;
          }
          try {
            follow(resolveTrustedRedirectUrl(currentUrl, res.headers.location), redirects + 1);
          } catch (err) {
            fail(err as Error);
          }
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          fail(new Error(`HTTP ${res.statusCode} downloading ${currentUrl}`));
          return;
        }

        const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
        let downloaded = 0;
        const file = createWriteStream(tempPath);

        res.on("data", (chunk: Buffer) => {
          downloaded += chunk.length;
          if (totalBytes > 0 && onProgress) {
            onProgress(Math.round((downloaded / totalBytes) * 100));
          }
        });

        res.pipe(file);
        file.on("finish", () => {
          file.close(async () => {
            try {
              assertCompleteDownload(downloaded, totalBytes);
              if (expectedSha256) await verifyFileSha256(tempPath, expectedSha256);
              await rename(tempPath, destPath);
              if (!settled) {
                settled = true;
                resolve();
              }
            } catch (err) {
              fail(err as Error);
            }
          });
        });
        file.on("error", (err) => fail(err));
        res.on("error", (err) => {
          file.destroy();
          fail(err);
        });
      });

      request.on("error", (err) => fail(err));
    };

    follow(url);
  });
}

export async function installWhisper(
  mainWindow: BrowserWindow,
  modelId = WHISPER_MODELS[0].id
): Promise<{ ok: true; executablePath: string; modelPath: string } | { ok: false; error: string }> {
  const model = WHISPER_MODELS.find((m) => m.id === modelId);
  if (!model) return { ok: false, error: `Modelo não encontrado: ${modelId}` };

  const modelPath = path.join(WHISPER_MODELS_DIR, model.file);
  const send = (stage: string, percent: number, message: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.VOICE_INPUT_INSTALL_PROGRESS, { stage, percent, message });
    }
  };

  try {
    await mkdir(WHISPER_DIR, { recursive: true });
    await mkdir(WHISPER_MODELS_DIR, { recursive: true });

    if (!existsSync(WHISPER_EXE)) {
      const zipPath = path.join(WHISPER_DIR, "whisper.zip");
      send("downloading_binary", 0, "Baixando whisper.cpp...");
      await downloadFile(WHISPER_BINARY_URL, zipPath, (p) => {
        send("downloading_binary", p, `Baixando whisper.cpp... ${p}%`);
      }, WHISPER_BINARY_SHA256);

      send("extracting", 0, "Extraindo whisper.cpp...");
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(zipPath);
      assertSafeZipEntries(zip.getEntries());
      zip.extractAllTo(WHISPER_DIR, true);
      send("extracting", 100, "whisper.cpp extraído");

      await unlink(zipPath).catch(() => {});
    }

    if (!existsSync(modelPath)) {
      send("downloading_model", 0, `Baixando modelo ${model.name}...`);
      await downloadFile(model.url, modelPath, (p) => {
        send("downloading_model", p, `Baixando modelo ${model.name}... ${p}%`);
      }, model.sha256);
    }

    send("verifying", 50, "Verificando instalação...");
    if (!existsSync(WHISPER_EXE)) {
      send("error", 0, "whisper-cli.exe não encontrado após extração");
      return { ok: false, error: "whisper-cli.exe não encontrado após extração" };
    }
    if (!existsSync(modelPath)) {
      send("error", 0, "Modelo whisper.cpp não encontrado após download");
      return { ok: false, error: "Modelo whisper.cpp não encontrado após download" };
    }

    send("done", 100, "whisper.cpp instalado com sucesso!");
    return { ok: true, executablePath: WHISPER_EXE, modelPath };
  } catch (err) {
    const msg = (err as Error).message;
    send("error", 0, msg);
    return { ok: false, error: msg };
  }
}

function hashFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
