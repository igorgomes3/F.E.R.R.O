import { useEffect, useState } from "react";
import type { FerroConfig } from "../../shared/types";
import LLMProviderPanel from "../components/settings/LLMProviderPanel";
import TTSProviderPanel from "../components/settings/TTSProviderPanel";
import VoiceInputPanel from "../components/settings/VoiceInputPanel";

export default function Settings() {
  const [config, setConfig] = useState<FerroConfig | null>(null);

  useEffect(() => {
    window.ferroAPI.getConfig().then((c) => setConfig(c as FerroConfig));
    const unsub = window.ferroAPI.onConfigChanged(() => {
      window.ferroAPI.getConfig().then((c) => setConfig(c as FerroConfig));
    });
    return unsub;
  }, []);

  if (!config) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p style={{ color: "var(--text-muted)" }}>Carregando...</p>
      </div>
    );
  }

  const updateConfig = async (path: string, value: unknown) => {
    await window.ferroAPI.setConfig(path, value);
    setConfig((prev) => {
      if (!prev) return prev;
      const clone = structuredClone(prev);
      const keys = path.split(".");
      let obj: Record<string, unknown> = clone as unknown as Record<string, unknown>;
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]] as Record<string, unknown>;
      }
      obj[keys[keys.length - 1]] = value;
      return clone;
    });
  };

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          Configurações
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Configure provedores de IA e voz
        </p>
      </div>

      <LLMProviderPanel config={config} onUpdate={updateConfig} />
      <TTSProviderPanel config={config} onUpdate={updateConfig} />
      <VoiceInputPanel config={config} />

      {/* Volume */}
      <section className="space-y-4">
        <h3
          className="text-lg font-semibold"
          style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
        >
          Volume da voz
        </h3>
        <div className="card-glass space-y-3 p-5">
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round((config.tts.volume ?? 0.8) * 100)}
              onChange={(e) => updateConfig("tts.volume", parseInt(e.target.value) / 100)}
              className="flex-1 accent-[var(--accent-blue)]"
            />
            <span className="w-10 text-right text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              {Math.round((config.tts.volume ?? 0.8) * 100)}%
            </span>
          </div>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Controla o volume do TTS via Piper e ElevenLabs. Não afeta a voz do sistema.
          </p>
        </div>
      </section>

      {/* Logging */}
      <section className="space-y-4">
        <h3
          className="text-lg font-semibold"
          style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
        >
          Logs
        </h3>
        <div className="card-glass space-y-3 p-5">
          <ToggleRow
            label="Salvar snapshots no log"
            desc="Grava cada estado do jogo (arquivos maiores)"
            checked={config.logging.logSnapshots}
            onChange={(v) => updateConfig("logging.logSnapshots", v)}
          />
          <ToggleRow
            label="Salvar payloads da LLM"
            desc="Grava prompts e respostas da IA"
            checked={config.logging.logLlmPayloads}
            onChange={(v) => updateConfig("logging.logLlmPayloads", v)}
          />
        </div>
      </section>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{label}</p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{desc}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="toggle-track"
      >
        <span className="toggle-thumb" />
      </button>
    </div>
  );
}
