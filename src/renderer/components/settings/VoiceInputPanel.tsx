import { useEffect, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { FerroConfig, SttLanguage, VoiceInputMode, VoiceInputStatus, WhisperProgress } from "../../../shared/types";
import { recordVoiceInputSample } from "../../lib/voice-capture";

interface Props {
  config: FerroConfig;
}

export default function VoiceInputPanel({ config }: Props) {
  const [status, setStatus] = useState<VoiceInputStatus | null>(null);
  const [progress, setProgress] = useState<WhisperProgress | null>(null);
  const [testing, setTesting] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState("");

  const voiceInput = config.voiceInput;
  const [drafts, setDrafts] = useState({
    pushToTalkHotkey: voiceInput.pushToTalkHotkey,
    toggleHotkey: voiceInput.toggleHotkey,
    executablePath: voiceInput.stt.executablePath,
    modelPath: voiceInput.stt.modelPath,
  });

  const refresh = async () => {
    const next = (await window.ferroAPI.getVoiceInputStatus()) as VoiceInputStatus;
    setStatus(next);
    return next;
  };

  useEffect(() => {
    void refresh();
    const unsubStatus = window.ferroAPI.onVoiceInputStatus((data) => {
      setStatus(data as VoiceInputStatus);
    });
    const unsubProgress = window.ferroAPI.onWhisperProgress((data) => {
      setProgress(data as WhisperProgress);
    });

    return () => {
      unsubStatus();
      unsubProgress();
    };
  }, []);

  useEffect(() => {
    setDrafts({
      pushToTalkHotkey: voiceInput.pushToTalkHotkey,
      toggleHotkey: voiceInput.toggleHotkey,
      executablePath: voiceInput.stt.executablePath,
      modelPath: voiceInput.stt.modelPath,
    });
  }, [voiceInput.pushToTalkHotkey, voiceInput.toggleHotkey, voiceInput.stt.executablePath, voiceInput.stt.modelPath]);

  const update = async (path: string, value: unknown) => {
    await window.ferroAPI.updateVoiceInputSetting(path, value);
    await refresh();
  };

  const commitDraft = async (path: string, value: string, currentValue: string) => {
    if (value === currentValue) return;
    await update(path, value);
  };

  const commitOnEnter = (event: KeyboardEvent<HTMLInputElement>, commit: () => void) => {
    if (event.key !== "Enter") return;
    event.currentTarget.blur();
  };

  const handleInstall = async () => {
    setInstalling(true);
    setMessage("");
    setProgress(null);
    try {
      const result = (await window.ferroAPI.installWhisper()) as { ok: boolean; error?: string };
      setMessage(result.ok ? "Whisper instalado e configurado." : result.error || "Erro ao instalar Whisper.");
      await refresh();
    } catch {
      setMessage("Erro ao instalar Whisper.");
    } finally {
      setInstalling(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setMessage("");
    try {
      const result = await recordVoiceInputSample();
      const nextStatus = await refresh();
      setMessage(getTestMessage(result, nextStatus));
    } catch {
      setMessage("Erro ao testar transcricao.");
    } finally {
      setTesting(false);
    }
  };

  const ready = status?.whisper.ready ?? false;
  const statusText = status
    ? status.state === "disabled"
      ? "Desativada"
      : status.state === "recording"
        ? "Gravando"
        : status.state === "transcribing"
          ? "Transcrevendo"
          : status.state === "routing"
            ? "Processando comando"
            : status.state === "error"
              ? "Erro"
              : "Pronta"
    : "Verificando";

  return (
    <section className="space-y-4">
      <h3
        className="text-lg font-semibold"
        style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
      >
        Entrada por voz
      </h3>

      <div className="card-glass space-y-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              STT local com Whisper.cpp
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Transcreve comandos no seu PC, sem enviar audio para serviços externos.
            </p>
          </div>
          <button
            role="switch"
            aria-label="Habilitar entrada por voz"
            aria-checked={voiceInput.enabled}
            onClick={() => update("voiceInput.enabled", !voiceInput.enabled)}
            className="toggle-track shrink-0"
          >
            <span className="toggle-thumb" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Modo de ativacao">
            <select
              className="input-field"
              value={voiceInput.mode}
              onChange={(event) => update("voiceInput.mode", event.target.value as VoiceInputMode)}
            >
              <option value="push_to_talk">Push-to-talk</option>
              <option value="toggle">Toggle</option>
            </select>
          </Field>

          <Field label="Idioma">
            <select
              className="input-field"
              value={voiceInput.stt.language}
              onChange={(event) => update("voiceInput.stt.language", event.target.value as SttLanguage)}
            >
              <option value="pt">Portugues</option>
              <option value="en">Ingles</option>
              <option value="auto">Auto</option>
            </select>
          </Field>

          <Field label="Hotkey Push-to-talk">
            <StringInput
              value={drafts.pushToTalkHotkey}
              onChange={(value) => setDrafts((current) => ({ ...current, pushToTalkHotkey: value }))}
              onCommit={() => commitDraft("voiceInput.pushToTalkHotkey", drafts.pushToTalkHotkey, voiceInput.pushToTalkHotkey)}
              onEnter={commitOnEnter}
              placeholder="Ex: Alt+Space"
            />
          </Field>

          <Field label="Hotkey Toggle">
            <StringInput
              value={drafts.toggleHotkey}
              onChange={(value) => setDrafts((current) => ({ ...current, toggleHotkey: value }))}
              onCommit={() => commitDraft("voiceInput.toggleHotkey", drafts.toggleHotkey, voiceInput.toggleHotkey)}
              onEnter={commitOnEnter}
              placeholder="Ex: Alt+V"
            />
          </Field>

          <Field label="Executavel Whisper">
            <StringInput
              value={drafts.executablePath}
              onChange={(value) => setDrafts((current) => ({ ...current, executablePath: value }))}
              onCommit={() => commitDraft("voiceInput.stt.executablePath", drafts.executablePath, voiceInput.stt.executablePath)}
              onEnter={commitOnEnter}
              placeholder="whisper-cli.exe"
            />
          </Field>

          <Field label="Modelo Whisper">
            <StringInput
              value={drafts.modelPath}
              onChange={(value) => setDrafts((current) => ({ ...current, modelPath: value }))}
              onCommit={() => commitDraft("voiceInput.stt.modelPath", drafts.modelPath, voiceInput.stt.modelPath)}
              onEnter={commitOnEnter}
              placeholder="ggml-base.bin"
            />
          </Field>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            className="btn-ghost"
            onClick={handleInstall}
            disabled={installing}
            style={{ opacity: installing ? 0.5 : 1 }}
          >
            {installing ? "Instalando..." : "Instalar Whisper"}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={handleTest}
            disabled={testing || !voiceInput.enabled || !ready}
            style={{ opacity: testing || !voiceInput.enabled || !ready ? 0.5 : 1 }}
          >
            {testing ? "Testando..." : "Testar transcricao"}
          </button>
        </div>

        <div className="rounded-xl px-3 py-3 text-sm" style={{ background: "var(--bg-input)", color: "var(--text-secondary)" }}>
          <p>
            Status: <span style={{ color: ready ? "var(--accent-green)" : "var(--text-muted)" }}>{statusText}</span>
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Whisper: {ready ? "pronto" : "pendente"}
            {progress ? ` · ${progress.message} (${progress.percent}%)` : ""}
          </p>
          {message && <p className="mt-2 text-xs">{message}</p>}
        </div>
      </div>
    </section>
  );
}

function getTestMessage(result: unknown, status: VoiceInputStatus): string {
  if (isMessageResult(result)) return result.message;
  return status.lastResultMessage || status.lastTranscript || status.errorMessage || "Teste finalizado.";
}

function isMessageResult(result: unknown): result is { message: string } {
  return typeof result === "object" && result !== null && "message" in result && typeof (result as { message?: unknown }).message === "string";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function StringInput({
  value,
  onChange,
  onCommit,
  onEnter,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onEnter: (event: KeyboardEvent<HTMLInputElement>, commit: () => void) => void;
  placeholder: string;
}) {
  return (
    <input
      className="input-field"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => onEnter(event, onCommit)}
      placeholder={placeholder}
    />
  );
}
