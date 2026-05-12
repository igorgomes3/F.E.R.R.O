import { app, BrowserWindow, Menu, shell } from "electron";
import { join } from "path";
import { initConfigStore, getAll } from "./services/config-service";
import { registerIpcHandlers } from "./ipc/handlers";
import { engine } from "./services/engine";
import { checkPiper, getPiperDir, getVoicesDir } from "./services/piper-installer";
import { getStartupState } from "./services/startup-state";
import { getVoiceInputController } from "./services/voice-input-singleton";

let mainWindow: BrowserWindow | null = null;

// ── Structured logging ────────────────────────────────
const TAG = "[Main]";
function log(...args: unknown[]) { console.log(TAG, ...args); }
function warn(...args: unknown[]) { console.warn(TAG, ...args); }
function err(...args: unknown[]) { console.error(TAG, ...args); }

async function createWindow(): Promise<void> {
  log("=== F.E.R.R.O Coach starting ===");
  log("Electron", process.versions.electron, "| Node", process.versions.node, "| Platform", process.platform);

  const config = initConfigStore();
  const appConfig = getAll();

  log("Config loaded:");
  log("  LLM:", appConfig.llm.activeProvider, appConfig.llm.activeProvider !== "none" ? `(${appConfig.llm.providers[appConfig.llm.activeProvider].model})` : "");
  log("  TTS:", appConfig.tts.activeProvider);
  log("  Piper exe:", appConfig.tts.providers.piper.executablePath);
  log("  Piper model:", appConfig.tts.providers.piper.modelPath);
  log("  Logs dir:", appConfig.logging.logsDir);
  log("  Piper dir:", getPiperDir());
  log("  Voices dir:", getVoicesDir());

  const piperStatus = checkPiper();
  const startupState = getStartupState(appConfig);
  log("Piper installed:", piperStatus.installed, piperStatus.path ?? "");
  log("Startup state:", startupState);

  const bounds = config.get("app.windowBounds" as never) as {
    x: number; y: number; width: number; height: number;
  } | null;

  mainWindow = new BrowserWindow({
    width: bounds?.width ?? 1100,
    height: bounds?.height ?? 750,
    x: bounds?.x ?? undefined,
    y: bounds?.y ?? undefined,
    minWidth: 900,
    minHeight: 600,
    show: false,
    icon: app.isPackaged
      ? join(process.resourcesPath, "icon.png")
      : join(__dirname, "../../resources/icon.png"),
    backgroundColor: "#08080c",
    title: "F.E.R.R.O Coach",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.on("ready-to-show", () => {
    log("Window ready, showing");
    mainWindow!.show();
  });

  const saveBounds = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const b = mainWindow.getBounds();
      config.set("app.windowBounds" as never, { x: b.x, y: b.y, width: b.width, height: b.height } as never);
    }
  };
  mainWindow.on("resized", saveBounds);
  mainWindow.on("moved", saveBounds);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  log("Registering IPC handlers...");
  registerIpcHandlers(mainWindow);
  await getVoiceInputController()?.registerGlobalHotkeys();
  engine.setWindow(mainWindow);

  if (startupState.engineAutoStartAllowed) {
    log("Auto-starting engine (startup state ready)");
    engine.start();
  } else if (startupState.needsOnboarding) {
    warn("Engine NOT auto-started: onboarding is incomplete");
  } else {
    warn("Engine NOT auto-started: active TTS provider is not ready");
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    log("Loading dev server:", process.env.ELECTRON_RENDERER_URL);
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    const htmlPath = join(__dirname, "../renderer/index.html");
    log("Loading production HTML:", htmlPath);
    mainWindow.loadFile(htmlPath);
  }
}

app.whenReady().then(createWindow);

app.on("before-quit", () => {
  getVoiceInputController()?.unregisterGlobalHotkeys();
});

app.on("window-all-closed", () => {
  log("All windows closed, quitting");
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Global error handlers
process.on("uncaughtException", (error) => {
  err("UNCAUGHT EXCEPTION:", error.message, error.stack);
});

process.on("unhandledRejection", (reason) => {
  err("UNHANDLED REJECTION:", reason);
});
