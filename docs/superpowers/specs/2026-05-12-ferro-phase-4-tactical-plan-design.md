# F.E.R.R.O Phase 4 Tactical Plan Design

## Objective

Phase 4 upgrades F.E.R.R.O from isolated alerts into a conservative tactical planning assistant. The goal is to maintain a current, explainable plan for the match using game state, tactical memory, objective timers, deaths, threats, powerspikes, and lane pressure.

This phase should not attempt to solve all League of Legends macro. It creates a small deterministic decision layer that can produce useful plans, explain why they were chosen, and feed those plans into the dashboard and coach context.

## Scope

The approved vertical slice is **current tactical plan plus minimal objective strategy**.

In scope:

- Compute a current `TacticalPlan` from structured match context.
- Recalculate the plan only when tactically relevant inputs change.
- Use tactical memory from Phase 2, including known enemy cooldowns and confidence.
- Use local voice input from Phase 3 only as an input path into tactical memory; voice does not get separate planning logic.
- Show the current plan on the dashboard.
- Inject the current plan into the coach/LLM context.
- Keep the first rule set focused on objective preparation, fight avoidance, fight/pick windows, reset windows, safe farming, and pressure.

Out of scope:

- Riot API key integration.
- Post-game learning.
- Large champion matchup knowledge base.
- Overlay or second-screen mode.
- Advanced wave-state macro.
- LLM-driven plan decisions on every tick.
- Claims of perfect macro calls.

## Product Behavior

F.E.R.R.O maintains a current plan with one main intent:

- `fight`
- `avoid_fight`
- `prepare_objective`
- `trade_objective`
- `reset`
- `pressure_lane`
- `farm_safe`

Each plan includes:

- A short summary.
- A priority: `low`, `medium`, or `high`.
- A confidence value: `confirmed`, `estimated`, or `unknown`.
- A creation game time.
- Optional expiration game time.
- Two to four structured reasons explaining the decision.

The plan must be explainable. A call like "prepare dragon" should include reasons such as "dragon in 70 seconds", "enemy Ashe has no Flash", or "enemy Zed is ahead" rather than hiding everything behind a score.

If the context is incomplete, the system should choose conservative output. It should prefer `farm_safe` or low-priority `prepare_objective` over aggressive calls based on weak data.

## Architecture

### Core Planning Module

Add a core module, likely `src/core/tactical-plan.ts`, that converts match context into a `TacticalPlan`.

The module must be pure and testable:

- No Electron IPC.
- No renderer code.
- No TTS.
- No LLM calls.
- No filesystem access.
- No global mutable state.

The module receives structured input and returns a structured result.

### Suggested Types

```ts
export type TacticalPlanIntent =
  | "fight"
  | "avoid_fight"
  | "prepare_objective"
  | "trade_objective"
  | "reset"
  | "pressure_lane"
  | "farm_safe";

export type TacticalPlanPriority = "low" | "medium" | "high";
export type TacticalPlanConfidence = "confirmed" | "estimated" | "unknown";

export interface TacticalPlanReason {
  kind: "objective" | "cooldown" | "death" | "threat" | "powerspike" | "lane" | "fallback";
  text: string;
  confidence: TacticalPlanConfidence;
  weight: number;
}

export interface TacticalPlan {
  intent: TacticalPlanIntent;
  priority: TacticalPlanPriority;
  summary: string;
  reasons: TacticalPlanReason[];
  confidence: TacticalPlanConfidence;
  createdAtGameTimeSeconds: number;
  expiresAtGameTimeSeconds?: number;
}
```

The exact input type should follow existing game/analyzer/engine structures. The implementation plan should inspect current data shapes before finalizing the input contract.

### Engine Integration

The main engine should maintain the latest tactical plan alongside existing engine state.

The plan should be recalculated when relevant inputs change, including:

- Objective timers crossing preparation windows.
- Champion death or respawn changes.
- Tactical memory updates, especially cooldowns.
- Large threat or powerspike changes already exposed by the existing analyzer; this phase should not introduce a new champion knowledge database.
- Significant lane or pressure changes if already available in current analyzer data.

The plan should not recalculate on every raw tick if the tactical inputs are effectively unchanged. Stable output matters more than maximum frequency.

### Coach Integration

The coach context should include the current tactical plan as structured information. The LLM may phrase the recommendation, but the deterministic plan remains the source of truth for intent and reasons.

The prompt should make this relationship explicit: the LLM can explain or compress the plan, but should not invent a contradictory strategy.

### UI Integration

Add a small dashboard panel for the current plan.

It should show:

- Intent label.
- Priority.
- Summary.
- Main reasons.
- Confidence.

The panel should follow the existing dashboard visual language. This phase does not redesign the dashboard.

## Initial Decision Rules

The first version uses a small deterministic scoring/ranking system with explicit reasons.

### Prepare Objective

Use `prepare_objective` when a major or relevant neutral objective is spawning soon and the team is not clearly in a losing fight window.

Expected reasons:

- Objective spawn window.
- Cooldowns or deaths that improve contest odds.
- Ally/enemy strength indicators if available.

### Avoid Fight

Use `avoid_fight` when fighting is likely bad, especially when:

- An enemy carry or threat is strong and alive.
- An allied key champion is dead.
- The team appears behind in items, level, or current pressure.
- Important enemy cooldowns are unknown and no compensating advantage exists.

### Fight or Pick

Use `fight` when there is a clear, explainable window, such as:

- A key enemy is dead.
- A high-value enemy cooldown is confirmed unavailable.
- The allied team has a current strength or numbers advantage.
- A nearby objective makes the fight strategically valuable.

Aggressive plans require stronger evidence than defensive plans.

### Trade Objective

Use `trade_objective` when contesting the main objective looks bad and an alternative is plausible. The first implementation can keep this conservative and only emit it when existing data clearly supports the alternative.

### Reset

Use `reset` when the next important objective is not immediate and the context suggests a preparation window rather than a fight window. The first implementation can rely on objective timing and coarse advantage signals; it should not require precise gold inventory modeling.

### Pressure Lane

Use `pressure_lane` when no immediate objective exists and current context suggests map pressure is better than grouping. This should remain low or medium priority in the first version unless current analyzer data gives strong evidence.

### Farm Safe

Use `farm_safe` as the conservative fallback when there is no reliable tactical recommendation or when the available context is too weak for a specific call.

## Priority and Confidence

Priority should be based on urgency and impact:

- High: imminent objective, decisive fight window, or serious danger.
- Medium: useful preparation or pressure call with moderate urgency.
- Low: fallback, weak signal, or long preparation window.

Confidence should reflect evidence quality:

- `confirmed`: based primarily on confirmed game state or user-confirmed tactical memory.
- `estimated`: based on inferred cooldowns, approximate spikes, or incomplete analyzer data.
- `unknown`: based on weak or missing context.

If a plan combines confirmed and estimated reasons, confidence should degrade to the weakest major reason that materially affects the decision.

## Stability

The plan should not flap between intents because of tiny score changes.

The implementation should include one or more simple stability mechanisms:

- Recalculate only on meaningful input changes.
- Keep the existing plan if the new plan has the same priority and only a marginally different score.
- Use short expiration windows for objective-related plans.

The exact mechanism should be chosen during implementation based on current engine flow.

## Error Handling and Fallbacks

- If plan computation throws, the engine should keep running and expose a safe fallback plan or no plan.
- If input context is missing, return `farm_safe` with a fallback reason.
- If tactical memory is empty, objective and game-state rules should still work.
- If objective data is unavailable, the planner should avoid objective-specific claims.

## Testing Strategy

Unit tests for the core planner should cover:

- Neutral objective soon with neutral context returns `prepare_objective`.
- Enemy carry strong plus allied key death returns `avoid_fight`.
- Confirmed enemy Flash cooldown near objective increases fight or objective-preparation confidence.
- Insufficient data returns conservative `farm_safe` or low-priority `prepare_objective`.
- Every non-empty plan includes readable reasons and confidence.
- Competing rules select the safer plan when aggressive evidence is weak.

Integration tests should cover:

- Engine stores and exposes the latest tactical plan.
- Tactical memory updates can affect the plan.
- Coach context includes the current plan.
- Dashboard source/render path includes the tactical plan panel.

Verification before completion must include:

- `npm test`
- `rtk npm run typecheck`
- `rtk npm run build`

## Success Criteria

Phase 4 is complete when:

- A deterministic `TacticalPlan` is computed and tested.
- The current plan appears on the dashboard.
- The current plan is included in coach/LLM context.
- Tactical memory can influence the plan.
- Voice/text inputs still feed the same tactical memory path.
- Tests cover planner rules, engine/coach integration, and dashboard presence.
- Final verification passes on `main` before the phase is closed.

## Risks

- Bad calls from incomplete context.
- Overly aggressive recommendations based on weak evidence.
- Plan instability if recalculated too often.
- LLM output contradicting deterministic plan.

Mitigations:

- Conservative fallback behavior.
- Explicit confidence.
- Small rule set with test scenarios.
- Structured plan in coach context with instructions not to contradict it.
- Dashboard visibility so the user can see why the app is making a call.
