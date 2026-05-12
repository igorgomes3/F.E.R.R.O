import { useState } from "react";
import type { FerroConfig, LLMProviderType } from "../../../shared/types";
import APIKeyInput from "./APIKeyInput";
import CustomLLMSettings from "./CustomLLMSettings";
import ModelSelector from "./ModelSelector";

const PROVIDERS: { id: LLMProviderType; name: string; desc: string; badge: string }[] = [
  { id: "none", name: "Sem LLM", desc: "Apenas heuristicas locais", badge: "Gratuito" },
  { id: "zai", name: "Z.AI", desc: "GLM-5 via Z.ai", badge: "Pago" },
  { id: "openai", name: "OpenAI", desc: "GPT / o-series", badge: "Pago" },
  { id: "gemini", name: "Gemini", desc: "Google AI", badge: "Pago" },
  { id: "custom", name: "Custom", desc: "OpenAI-compatible", badge: "Avancado" },
];

interface Props {
  config: FerroConfig;
  onUpdate: (path: string, value: unknown) => Promise<void>;
}

export default function LLMProviderPanel({ config, onUpdate }: Props) {
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const active = config.llm.activeProvider;

  const handleTest = async () => {
    if (active === "none") return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = (await window.ferroAPI.testLLM(active)) as { ok: boolean; ms?: number; error?: string };
      setTestResult({
        ok: result.ok,
        message: result.ok ? `Conectado (${result.ms}ms)` : result.error || "Erro",
      });
    } catch {
      setTestResult({ ok: false, message: "Erro ao testar" });
    }
    setTesting(false);
  };

  return (
    <section className="space-y-4">
      <h3
        className="text-lg font-semibold"
        style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
      >
        Inteligencia Artificial
      </h3>

      <div
        className="rounded-xl px-4 py-3 text-sm"
        style={{
          background: "rgba(56, 189, 248, 0.08)",
          border: "1px solid rgba(56, 189, 248, 0.18)",
          color: "var(--text-primary)",
        }}
      >
        <p className="font-medium">Por que usar LLM?</p>
        <p className="mt-1" style={{ color: "var(--text-secondary)" }}>
          As heuristicas cobrem avisos objetivos e rapidos. A LLM entra para ler contexto, macro e timing quando nao
          existe um gatilho tao claro, gerando dicas mais inteligentes sobre rotacao, pressao e proximo passo.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => onUpdate("llm.activeProvider", p.id)}
            className="card-glass px-3 py-3 text-left"
            style={{
              borderColor: active === p.id ? "var(--glow-purple)" : undefined,
              boxShadow: active === p.id ? "0 0 12px rgba(124, 91, 245, 0.12)" : undefined,
              cursor: "pointer",
              background: active === p.id ? "var(--bg-elevated)" : undefined,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium" style={{ color: active === p.id ? "var(--text-primary)" : "var(--text-secondary)" }}>
                {p.name}
              </p>
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                style={{
                  background: p.badge === "Gratuito" ? "rgba(52, 211, 153, 0.12)" : "rgba(245, 166, 35, 0.12)",
                  color: p.badge === "Gratuito" ? "var(--accent-green)" : "var(--accent-orange)",
                }}
              >
                {p.badge}
              </span>
            </div>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
              {p.desc}
            </p>
          </button>
        ))}
      </div>

      {active !== "none" && (
        <div className="card-glass space-y-4 p-5">
          {active === "custom" ? (
            <CustomLLMSettings provider={config.llm.providers.custom} onUpdate={onUpdate} />
          ) : (
            <>
              <APIKeyInput
                label="API Key"
                value={config.llm.providers[active].apiKey}
                onChange={(v) => onUpdate(`llm.providers.${active}.apiKey`, v)}
              />
              <ModelSelector
                provider={active}
                value={config.llm.providers[active].model}
                onChange={(v) => onUpdate(`llm.providers.${active}.model`, v)}
              />
            </>
          )}
          <div className="flex items-center gap-3">
            <button
              className="btn-ghost text-sm"
              onClick={handleTest}
              disabled={testing || !config.llm.providers[active].apiKey}
            >
              {testing ? "Testando..." : "Testar conexao"}
            </button>
            {testResult && (
              <span className="text-sm" style={{ color: testResult.ok ? "var(--accent-green)" : "var(--accent-red)" }}>
                {testResult.message}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
