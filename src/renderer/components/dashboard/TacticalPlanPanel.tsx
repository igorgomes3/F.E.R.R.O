import type { TacticalPlan } from "../../../shared/types";

type TacticalPlanPanelProps = {
  plan: TacticalPlan | null;
};

export default function TacticalPlanPanel({ plan }: TacticalPlanPanelProps) {
  if (!plan) {
    return (
      <section className="card-glass w-full max-w-lg p-4">
        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Plano atual
        </p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Ainda nao tenho um plano tatico ativo. Entre em partida para eu priorizar objetivos, lutas e resets.
        </p>
      </section>
    );
  }

  const confidenceLabel = plan.confidence === "confirmed" ? "Confirmado" : plan.confidence === "estimated" ? "Estimado" : "Incerto";
  const priorityLabel = plan.priority === "high" ? "Alta" : plan.priority === "medium" ? "Media" : "Baixa";

  return (
    <section className="card-glass w-full max-w-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Plano atual
          </p>
          <p className="mt-1.5 text-sm font-medium leading-relaxed" style={{ color: "var(--text-primary)" }}>
            {plan.summary}
          </p>
        </div>
        <div className="shrink-0 rounded-full px-3 py-1 text-xs font-medium" style={{ color: "var(--text-secondary)", background: "var(--bg-input)" }}>
          {priorityLabel}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <span>{confidenceLabel}</span>
        <span>Intent: {plan.intent.replaceAll("_", " ")}</span>
      </div>

      {plan.reasons.length > 0 ? (
        <div className="mt-4 space-y-2">
          {plan.reasons.map((reason) => (
            <p key={`${reason.kind}-${reason.text}`} className="rounded-lg px-3 py-2 text-sm" style={{ color: "var(--text-secondary)", background: "var(--bg-input)" }}>
              {reason.text}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
