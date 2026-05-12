import type { LLMProviderType } from "../../../shared/types";

const LLM_MODELS: Record<string, string[]> = {
  zai: ["glm-5", "glm-5-turbo", "glm-4.7", "glm-4.6", "glm-4.5", "glm-4.5-air", "glm-4.6v"],
  openai: ["gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini", "o3", "o3-mini", "o4-mini"],
  gemini: ["gemini-3.1-pro", "gemini-3-pro", "gemini-3-flash", "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite"],
};

interface Props {
  provider: LLMProviderType;
  value: string;
  models?: string[];
  onChange: (model: string) => void;
}

export default function ModelSelector({ provider, value, models: customModels, onChange }: Props) {
  if (provider === "none") return null;
  const normalizedCustomModels = customModels?.map((model) => model.trim()).filter(Boolean) ?? [];
  const models = provider === "custom"
    ? (normalizedCustomModels.length > 0 ? normalizedCustomModels : [value].filter(Boolean))
    : LLM_MODELS[provider] ?? [];

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        Modelo
      </label>
      <select
        className="select-field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {models.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
}
