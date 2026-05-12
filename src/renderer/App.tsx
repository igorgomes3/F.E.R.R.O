import { useState, useEffect } from "react";
import type { StartupState } from "../shared/types";
import AppShell from "./components/layout/AppShell";
import Dashboard from "./pages/Dashboard";
import MatchAnalysis from "./pages/MatchAnalysis";
import Messages from "./pages/Messages";
import Settings from "./pages/Settings";
import PiperSetup from "./pages/PiperSetup";
import VoiceInputCaptureBridge from "./components/voice/VoiceInputCaptureBridge";

export type TabId = "dashboard" | "match" | "messages" | "settings";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [startupState, setStartupState] = useState<StartupState | null>(null);

  const loadStartupState = async () => {
    const next = (await window.ferroAPI.getStartupState()) as StartupState;
    setStartupState(next);
    return next;
  };

  useEffect(() => {
    void loadStartupState();
    const unsub = window.ferroAPI.onConfigChanged(() => {
      void loadStartupState();
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!startupState || startupState.needsOnboarding || !startupState.engineAutoStartAllowed) {
      return;
    }

    void window.ferroAPI.getEngineStatus().then((engineState) => {
      const status = (engineState as { status?: string }).status;
      if (status === "idle" || status === "error") {
        return window.ferroAPI.startEngine();
      }
      return undefined;
    });
  }, [startupState]);

  const piperNeedsRepair = Boolean(
    startupState &&
    !startupState.needsOnboarding &&
    startupState.activeTtsProvider === "piper" &&
    (!startupState.piperBinaryInstalled || !startupState.piperModelConfigured || !startupState.piperModelExists)
  );

  const piperRepairNotice = piperNeedsRepair ? (
    <div
      className="mb-6 rounded-2xl px-4 py-3"
      style={{
        background: "rgba(245, 166, 35, 0.12)",
        border: "1px solid rgba(245, 166, 35, 0.25)",
        color: "var(--text-primary)",
      }}
    >
      <p className="text-sm font-semibold">Piper precisa de reparo</p>
      <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
        {!startupState?.piperBinaryInstalled
          ? "O binário do Piper não está instalado. Abra Configurações > Voz para reinstalar."
          : !startupState?.piperModelConfigured
            ? "Nenhuma voz Piper está configurada. Abra Configurações > Voz e selecione ou baixe uma voz."
            : "A voz Piper configurada não foi encontrada no disco. Abra Configurações > Voz para reparar."}
      </p>
    </div>
  ) : null;

  // Loading state
  if (startupState === null) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ background: "var(--bg-void)" }}>
        <div className="glow-orb glow-orb-purple" style={{ width: 300, height: 300, top: "30%", left: "40%" }} />
      </div>
    );
  }

  // First-run Piper setup
  if (startupState.needsOnboarding) {
    return (
      <PiperSetup
        onComplete={() => {
          void loadStartupState();
        }}
      />
    );
  }

  return (
    <AppShell activeTab={activeTab} onTabChange={setActiveTab} notice={piperRepairNotice}>
      <VoiceInputCaptureBridge />
      {activeTab === "dashboard" && <Dashboard />}
      {activeTab === "match" && <MatchAnalysis />}
      {activeTab === "messages" && <Messages />}
      {activeTab === "settings" && <Settings />}
    </AppShell>
  );
}
