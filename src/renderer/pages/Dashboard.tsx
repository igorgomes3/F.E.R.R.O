import { useEffect, useState } from "react";
import type { EngineState } from "../../shared/types";
import LogPanel from "../components/dashboard/LogPanel";
import TacticalMemoryPanel from "../components/dashboard/TacticalMemoryPanel";
import VoiceInputStatusPanel from "../components/dashboard/VoiceInputStatusPanel";

const DEFAULT_STATE: EngineState = {
  status: "idle",
  gameDetected: false,
  gameTime: 0,
  activeChampion: "",
  lastMessage: "",
  lastMessageSource: "",
  lastLLMMs: 0,
  lastTTSMs: 0,
  ttsStatus: "idle",
  llmStatus: "idle",
  piperStatus: "missing",
  errorMessage: null,
};

export default function Dashboard() {
  const [engine, setEngine] = useState<EngineState>(DEFAULT_STATE);

  useEffect(() => {
    window.ferroAPI.getEngineStatus().then((s) => setEngine(s as EngineState));
    const unsub = window.ferroAPI.onEngineEvent(() => {
      window.ferroAPI.getEngineStatus().then((s) => setEngine(s as EngineState));
    });
    return unsub;
  }, []);

  const isActive = engine.status === "coaching" || engine.status === "waiting_for_game";
  const statusColor = isActive ? "var(--accent-green)" : engine.status === "error" ? "var(--accent-red)" : "var(--text-muted)";
  const statusText = engine.status === "coaching"
    ? "Em partida"
    : engine.status === "waiting_for_game"
      ? "Ativo"
      : engine.status === "error"
        ? "Erro"
        : "Inativo";

  return (
    <div className="relative flex flex-col items-center">
      {/* Background glow */}
      <div
        className="glow-orb glow-orb-purple"
        style={{ width: 400, height: 400, top: -100, left: "calc(50% - 200px)", animation: "pulseGlow 4s ease-in-out infinite" }}
      />
      <div
        className="glow-orb glow-orb-blue"
        style={{ width: 250, height: 250, top: -50, left: "calc(50% - 50px)", animation: "pulseGlow 5s ease-in-out infinite 1s" }}
      />

      {/* Hero */}
      <div className="animate-in relative z-10 flex flex-col items-center pt-12 text-center">
        <h1
          className="text-5xl font-bold tracking-tight"
          style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
        >
          F.E.R.R.O Coach
        </h1>

        <div className="mt-4 flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{
              backgroundColor: statusColor,
              boxShadow: isActive ? `0 0 10px ${statusColor}` : "none",
            }}
          />
          <span className="text-sm font-medium" style={{ color: statusColor }}>
            {statusText}
          </span>
        </div>

        <p
          className="animate-in animate-in-delay-1 mt-6 max-w-md text-lg leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          {engine.status === "coaching"
            ? `Coaching ${engine.activeChampion || "ativo"} — ${Math.floor(engine.gameTime / 60)}:${String(Math.floor(engine.gameTime % 60)).padStart(2, "0")}`
            : engine.status === "error"
              ? engine.errorMessage || "Erro desconhecido"
              : "Estou rodando. Pode jogar sua partida que eu falo tudo pra você."}
        </p>
      </div>

      {/* Status cards */}
      <div className="animate-in animate-in-delay-2 relative z-10 mt-12 grid w-full max-w-lg grid-cols-3 gap-3">
        <StatusMini
          label="LLM"
          value={engine.llmStatus === "disabled" ? "Heurístico" : engine.llmStatus === "error" ? "Erro" : "Conectada"}
          active={engine.llmStatus === "idle" || engine.llmStatus === "calling"}
          error={engine.llmStatus === "error"}
          disabled={engine.llmStatus === "disabled"}
        />
        <StatusMini
          label="Voz"
          value={engine.ttsStatus === "speaking" ? "Falando..." : engine.ttsStatus === "error" ? "Erro" : "Pronta"}
          active={engine.ttsStatus !== "error"}
          error={engine.ttsStatus === "error"}
        />
        <StatusMini
          label="Partida"
          value={engine.gameDetected ? "Em jogo" : "Aguardando"}
          active={engine.gameDetected}
        />
      </div>

      {/* Last message */}
      {engine.lastMessage && (
        <div
          className="animate-in animate-in-delay-3 card-glass relative z-10 mt-8 w-full max-w-lg p-4"
        >
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Última mensagem
          </p>
          <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
            "{engine.lastMessage}"
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {engine.lastMessageSource === "llm" ? "LLM" : engine.lastMessageSource === "heuristic" ? "Heurística" : "Fallback"}
            {engine.lastLLMMs > 0 && ` · ${engine.lastLLMMs}ms`}
            {engine.lastTTSMs > 0 && ` · TTS ${engine.lastTTSMs}ms`}
          </p>
        </div>
      )}

      {/* Tactical memory */}
      <div className="animate-in animate-in-delay-4 relative z-10 mt-8 w-full max-w-lg">
        <TacticalMemoryPanel />
      </div>

      <div className="animate-in animate-in-delay-4 relative z-10 mt-4 w-full max-w-lg">
        <VoiceInputStatusPanel />
      </div>

      {/* Log panel */}
      <div className="animate-in animate-in-delay-4 relative z-10 mt-12 w-full">
        <LogPanel />
      </div>
    </div>
  );
}

function StatusMini({
  label,
  value,
  active = false,
  error = false,
  disabled = false,
}: {
  label: string;
  value: string;
  active?: boolean;
  error?: boolean;
  disabled?: boolean;
}) {
  const dotColor = error
    ? "var(--accent-red)"
    : disabled
      ? "var(--text-muted)"
      : active
        ? "var(--accent-green)"
        : "var(--text-muted)";

  return (
    <div className="card-glass flex flex-col items-center gap-2 p-4 text-center">
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: dotColor, boxShadow: active ? `0 0 6px ${dotColor}` : "none" }}
        />
        <span className="text-[11px] font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
      </div>
      <span className="text-sm font-medium" style={{ color: error ? "var(--accent-red)" : "var(--text-secondary)" }}>
        {value}
      </span>
    </div>
  );
}
