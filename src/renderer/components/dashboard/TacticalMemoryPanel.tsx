import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { ChampionCooldown, TacticalCommandResult } from "../../../shared/types";

const PLACEHOLDER = "Ex: Ashe flashou, Zed sem ult, Ashe tem flash?";

export default function TacticalMemoryPanel() {
  const [command, setCommand] = useState("");
  const [lastResponse, setLastResponse] = useState("Aguardando comando tatico.");
  const [cooldowns, setCooldowns] = useState<ChampionCooldown[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshCooldowns = async () => {
    try {
      const next = await window.ferroAPI?.listTacticalCooldowns?.();
      setCooldowns(Array.isArray(next) ? (next as ChampionCooldown[]) : []);
    } catch {
      setCooldowns([]);
      setLastResponse("Nao consegui carregar os cooldowns taticos.");
    }
  };

  useEffect(() => {
    void refreshCooldowns();
    const intervalId = setInterval(() => {
      void refreshCooldowns();
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = command.trim();
    if (!text || loading) return;

    setLoading(true);
    try {
      if (!window.ferroAPI?.sendTacticalCommand) {
        setLastResponse("Memoria tatica indisponivel neste renderer.");
        return;
      }

      const result = (await window.ferroAPI.sendTacticalCommand(text)) as TacticalCommandResult;
      setLastResponse(result?.message || "Comando processado.");
      setCommand("");
      await refreshCooldowns();
    } catch {
      setLastResponse("Nao consegui registrar ou consultar esse comando.");
      await refreshCooldowns();
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (loading) return;

    setLoading(true);
    try {
      if (!window.ferroAPI?.resetTacticalMemory) {
        setLastResponse("Memoria tatica indisponivel neste renderer.");
        return;
      }

      await window.ferroAPI.resetTacticalMemory();
      setLastResponse("Memoria tatica resetada.");
      await refreshCooldowns();
    } catch {
      setLastResponse("Nao consegui resetar a memoria tatica.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card-glass w-full max-w-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Memoria tatica
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Registre ou pergunte sobre flashes, ultimates e spells importantes.
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost px-3 py-2 text-xs"
          onClick={handleReset}
          disabled={loading}
          style={{ opacity: loading ? 0.5 : 1 }}
        >
          Reset
        </button>
      </div>

      <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
        <input
          className="input-field"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder={PLACEHOLDER}
          aria-label="Comando da memoria tatica"
          disabled={loading}
        />
        <button
          type="submit"
          className="btn-ghost shrink-0"
          disabled={loading || !command.trim()}
          style={{ opacity: loading || !command.trim() ? 0.5 : 1 }}
        >
          {loading ? "Processando..." : "Registrar / perguntar"}
        </button>
      </form>

      <div
        className="input-field mt-3 min-h-20"
        role="status"
        aria-live="polite"
        aria-label="Ultima resposta da memoria tatica"
      >
        {lastResponse}
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Cooldowns ativos
        </p>
        {cooldowns.length === 0 ? (
          <p className="rounded-lg px-3 py-2 text-sm" style={{ color: "var(--text-muted)", background: "var(--bg-input)" }}>
            Nenhum cooldown registrado.
          </p>
        ) : (
          <div className="space-y-2">
            {cooldowns.map((cooldown) => (
              <div
                key={`${cooldown.champion}:${cooldown.spell}`}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm"
                style={{ background: "var(--bg-input)", color: "var(--text-secondary)" }}
              >
                <span>
                  <span style={{ color: "var(--text-primary)" }}>{cooldown.champion}</span> {cooldown.spell}
                </span>
                <span className="text-xs" style={{ color: cooldown.confidence === "expired" ? "var(--accent-green)" : "var(--text-muted)" }}>
                  {cooldown.confidence === "expired" ? "pronto" : `volta ${formatClock(cooldown.readyAtSeconds)}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function formatClock(totalSeconds: number) {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const seconds = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
