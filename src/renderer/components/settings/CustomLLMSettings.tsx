import { useEffect, useState } from "react";
import type { LLMProviderConfig, LLMProtocol } from "../../../shared/types";
import APIKeyInput from "./APIKeyInput";
import ModelSelector from "./ModelSelector";

interface Props {
  provider: LLMProviderConfig;
  onUpdate: (path: string, value: unknown) => Promise<void>;
}

const PROTOCOLS: { value: LLMProtocol; label: string }[] = [
  { value: "chat_completions", label: "Chat Completions" },
  { value: "responses", label: "Responses" },
];

function parseModels(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((model) => model.trim())
    .filter(Boolean);
}

function formatModels(models?: string[]): string {
  return models?.join(", ") ?? "";
}

export default function CustomLLMSettings({ provider, onUpdate }: Props) {
  const externalModelsText = formatModels(provider.models);
  const [modelsText, setModelsText] = useState(externalModelsText);

  useEffect(() => {
    setModelsText(externalModelsText);
  }, [externalModelsText]);

  return (
    <>
      <div>
        <label className="mb-1 block text-xs text-[var(--text-muted)]">Base URL</label>
        <input
          type="url"
          value={provider.endpoint}
          onChange={(e) => onUpdate("llm.providers.custom.endpoint", e.target.value)}
          placeholder="https://api.openai.com/v1"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-teal)]"
        />
      </div>

      <APIKeyInput
        label="API Key"
        value={provider.apiKey}
        onChange={(v) => onUpdate("llm.providers.custom.apiKey", v)}
      />

      <div>
        <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Protocolo
        </label>
        <select
          className="select-field"
          value={provider.protocol ?? "chat_completions"}
          onChange={(e) => onUpdate("llm.providers.custom.protocol", e.target.value as LLMProtocol)}
        >
          {PROTOCOLS.map((protocol) => (
            <option key={protocol.value} value={protocol.value}>{protocol.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs text-[var(--text-muted)]">Modelos</label>
        <textarea
          value={modelsText}
          onChange={(e) => setModelsText(e.target.value)}
          onBlur={() => onUpdate("llm.providers.custom.models", parseModels(modelsText))}
          placeholder="gpt-4o-mini, llama-3.1-70b"
          rows={3}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-teal)]"
        />
      </div>

      <ModelSelector
        provider="custom"
        value={provider.model}
        models={provider.models}
        onChange={(v) => onUpdate("llm.providers.custom.model", v)}
      />
    </>
  );
}
