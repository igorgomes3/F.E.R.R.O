import { useEffect, useState } from "react";
import type { SttResult, VoiceInputStatus, VoiceRouteResult } from "../../../shared/types";

export default function VoiceInputStatusPanel() {
  const [status, setStatus] = useState<VoiceInputStatus | null>(null);

  useEffect(() => {
    const refresh = async () => {
      const next = (await window.ferroAPI.getVoiceInputStatus()) as VoiceInputStatus;
      setStatus(next);
    };

    void refresh();
    const unsubStatus = window.ferroAPI.onVoiceInputStatus((data) => {
      setStatus(data as VoiceInputStatus);
    });
    const unsubTranscript = window.ferroAPI.onVoiceInputTranscript((data) => {
      const result = data as SttResult;
      setStatus((current) => current ? { ...current, lastTranscript: result.ok ? result.transcript : current.lastTranscript } : current);
    });
    const unsubResult = window.ferroAPI.onVoiceInputResult((data) => {
      const result = data as VoiceRouteResult;
      setStatus((current) => current ? { ...current, lastResultMessage: result.message } : current);
    });

    return () => {
      unsubStatus();
      unsubTranscript();
      unsubResult();
    };
  }, []);

  const state = status?.state ?? "disabled";
  const stateText = state === "disabled"
    ? "Desativada"
    : state === "recording"
      ? "Ouvindo"
      : state === "transcribing"
        ? "Transcrevendo"
        : state === "routing"
          ? "Interpretando"
          : state === "error"
            ? "Erro"
            : "Pronta";
  const dotColor = state === "error"
    ? "var(--accent-red)"
    : status?.enabled && status.whisper.ready
      ? "var(--accent-green)"
      : "var(--text-muted)";
  const lastTranscript = status?.lastTranscript || "Nenhuma fala capturada ainda.";
  const lastResultMessage = status?.lastResultMessage || status?.errorMessage || "Aguardando comando por voz.";

  return (
    <section className="card-glass w-full max-w-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Voz
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Entrada local por Whisper.cpp
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full px-2 py-1" style={{ background: "var(--bg-input)" }}>
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor }} />
          <span className="text-xs font-medium" style={{ color: dotColor }}>{stateText}</span>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bg-input)", color: "var(--text-secondary)" }}>
          <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Ultima transcricao
          </p>
          <p className="mt-1">{lastTranscript}</p>
        </div>
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bg-input)", color: "var(--text-secondary)" }}>
          <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Resultado
          </p>
          <p className="mt-1">{lastResultMessage}</p>
        </div>
      </div>
    </section>
  );
}
