# F.E.R.R.O Phase 4 Tactical Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, explainable current tactical plan that appears on the dashboard and is injected into coach context.

**Architecture:** Build a pure `src/core/tactical-plan.ts` planner first, then expose its `TacticalPlan` type through shared state. Integrate it into `Engine` after snapshot analysis, feed it to `decideCoaching` through `StrategicContext`, and render it in a focused dashboard panel.

**Tech Stack:** TypeScript, Electron main/renderer, React, Vitest, existing F.E.R.R.O core analyzer/coach/engine modules.

---

## File Structure

- Create `src/core/tactical-plan.ts`: pure tactical planner, helper scoring functions, fallback plan.
- Modify `src/core/types.ts`: add tactical plan types to core and extend `StrategicContext`.
- Modify `src/shared/types.ts`: add renderer-safe tactical plan types and `EngineState.currentTacticalPlan`.
- Modify `src/main/services/engine.ts`: compute/store/reset plan and pass it to coach context.
- Modify `src/core/coach.ts`: include tactical plan in LLM prompt and fallback context.
- Create `src/renderer/components/dashboard/TacticalPlanPanel.tsx`: render current plan.
- Modify `src/renderer/pages/Dashboard.tsx`: include `TacticalPlanPanel` between last message and tactical memory.
- Create `tests/tactical-plan.test.ts`: planner unit tests.
- Modify `tests/tactical-memory.test.ts`: engine integration test for plan storage and tactical memory influence.
- Modify `tests/coach-message-modes.test.ts`: coach context/prompt test for tactical plan.
- Create `tests/tactical-plan-ui.test.ts`: source-level dashboard panel test matching current test style.

## Implementation Tasks

### Task 1: Core Tactical Plan Types and Fallback Planner

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/core/tactical-plan.ts`
- Test: `tests/tactical-plan.test.ts`

- [ ] **Step 1: Write failing fallback test**

Add `tests/tactical-plan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTacticalPlan } from "../src/core/tactical-plan";
import type { TacticalPlanInput } from "../src/core/types";

function baseInput(overrides: Partial<TacticalPlanInput> = {}): TacticalPlanInput {
  return {
    gameTimeSeconds: 600,
    objectiveStates: [],
    enemyThreat: null,
    enemyThreats: [],
    alliedPower: 10,
    enemyPower: 10,
    alliedDeaths: [],
    enemyDeaths: [],
    cooldowns: [],
    ...overrides,
  };
}

describe("tactical plan", () => {
  it("returns a conservative fallback when context is weak", () => {
    const plan = createTacticalPlan(baseInput());

    expect(plan.intent).toBe("farm_safe");
    expect(plan.priority).toBe("low");
    expect(plan.confidence).toBe("unknown");
    expect(plan.summary).toContain("Joga seguro");
    expect(plan.reasons).toEqual([
      expect.objectContaining({ kind: "fallback", confidence: "unknown" }),
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- tests/tactical-plan.test.ts`

Expected: FAIL because `../src/core/tactical-plan` or `TacticalPlanInput` does not exist.

- [ ] **Step 3: Add core types**

Modify `src/core/types.ts` after `StrategicContext` support types:

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

export interface TacticalPlanCooldownInput {
  champion: string;
  spell: string;
  isEnemy: boolean;
  confidence: "confirmed" | "estimated" | "expired" | "unknown";
  readyAtSeconds: number;
}

export interface TacticalPlanDeathInput {
  championName: string;
  isEnemy: boolean;
  respawnAtSeconds: number;
}

export interface TacticalPlanInput {
  gameTimeSeconds: number;
  objectiveStates: ObjectiveState[];
  enemyThreat: EnemyThreat | null;
  enemyThreats: EnemyThreat[];
  alliedPower: number;
  enemyPower: number;
  alliedDeaths: TacticalPlanDeathInput[];
  enemyDeaths: TacticalPlanDeathInput[];
  cooldowns: TacticalPlanCooldownInput[];
}
```

Extend `StrategicContext`:

```ts
export interface StrategicContext {
  activePlayer: ActivePlayerContext;
  enemyBuilds: EnemyBuildContext[];
  enemyThreat: EnemyThreat | null;
  enemyThreats: EnemyThreat[];
  alliedPower: number;
  enemyPower: number;
  scalingRead: string;
  objectiveStates: ObjectiveState[];
  tacticalMemory?: string;
  tacticalPlan?: TacticalPlan;
}
```

- [ ] **Step 4: Implement fallback planner**

Create `src/core/tactical-plan.ts`:

```ts
import type { TacticalPlan, TacticalPlanInput } from "./types";

export function createTacticalPlan(input: TacticalPlanInput): TacticalPlan {
  const gameTime = safeGameTime(input.gameTimeSeconds);

  return {
    intent: "farm_safe",
    priority: "low",
    summary: "Joga seguro e farma ate aparecer uma janela melhor.",
    confidence: "unknown",
    createdAtGameTimeSeconds: gameTime,
    expiresAtGameTimeSeconds: gameTime + 45,
    reasons: [
      {
        kind: "fallback",
        text: "Contexto insuficiente para recomendar luta ou objetivo.",
        confidence: "unknown",
        weight: 0,
      },
    ],
  };
}

function safeGameTime(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
```

- [ ] **Step 5: Run test to verify GREEN**

Run: `npm test -- tests/tactical-plan.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/tactical-plan.ts tests/tactical-plan.test.ts
git commit -m "feat: add tactical plan core types"
```

### Task 2: Objective Preparation and Conservative Fight Rules

**Files:**
- Modify: `src/core/tactical-plan.ts`
- Test: `tests/tactical-plan.test.ts`

- [ ] **Step 1: Add failing objective and avoid-fight tests**

Append inside `describe("tactical plan", ...)` in `tests/tactical-plan.test.ts`:

```ts
it("prepares a neutral objective when it is spawning soon", () => {
  const plan = createTacticalPlan(baseInput({
    gameTimeSeconds: 540,
    objectiveStates: [{ name: "dragão", spawnIn: "60 segundos", available: false }],
  }));

  expect(plan.intent).toBe("prepare_objective");
  expect(plan.priority).toBe("medium");
  expect(plan.summary).toContain("dragão");
  expect(plan.reasons).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "objective", confidence: "estimated" }),
  ]));
});

it("avoids fights when enemy threat is strong and an ally is dead", () => {
  const plan = createTacticalPlan(baseInput({
    enemyThreat: { championName: "Zed", score: 12, kda: "6/1/2", build: ["Youmuu"], majorItemCount: 2 },
    enemyThreats: [{ championName: "Zed", score: 12, kda: "6/1/2", build: ["Youmuu"], majorItemCount: 2 }],
    alliedDeaths: [{ championName: "Jinx", isEnemy: false, respawnAtSeconds: 645 }],
    alliedPower: 8,
    enemyPower: 13,
  }));

  expect(plan.intent).toBe("avoid_fight");
  expect(plan.priority).toBe("high");
  expect(plan.summary).toContain("evita luta");
  expect(plan.reasons).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "threat", text: expect.stringContaining("Zed") }),
    expect.objectContaining({ kind: "death", text: expect.stringContaining("Jinx") }),
  ]));
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- tests/tactical-plan.test.ts`

Expected: FAIL because planner still returns `farm_safe`.

- [ ] **Step 3: Implement minimal scoring**

Replace `createTacticalPlan` in `src/core/tactical-plan.ts` with:

```ts
import type { ObjectiveState, TacticalPlan, TacticalPlanInput, TacticalPlanReason } from "./types";

export function createTacticalPlan(input: TacticalPlanInput): TacticalPlan {
  const gameTime = safeGameTime(input.gameTimeSeconds);
  const avoidReasons = collectAvoidFightReasons(input, gameTime);

  if (score(avoidReasons) >= 7) {
    return {
      intent: "avoid_fight",
      priority: "high",
      summary: "Evita luta agora e joga para sobreviver ate a janela melhorar.",
      confidence: confidenceFromReasons(avoidReasons),
      createdAtGameTimeSeconds: gameTime,
      expiresAtGameTimeSeconds: gameTime + 30,
      reasons: avoidReasons.slice(0, 4),
    };
  }

  const objective = findSoonObjective(input.objectiveStates);
  if (objective) {
    const reasons: TacticalPlanReason[] = [
      {
        kind: "objective",
        text: `${capitalize(objective.name)} esta em janela de preparacao.`,
        confidence: "estimated",
        weight: 4,
      },
    ];

    return {
      intent: "prepare_objective",
      priority: objective.available ? "high" : "medium",
      summary: `Prepara ${objective.name}: arruma visao e evita luta longa antes da contestacao.`,
      confidence: confidenceFromReasons(reasons),
      createdAtGameTimeSeconds: gameTime,
      expiresAtGameTimeSeconds: gameTime + 45,
      reasons,
    };
  }

  return fallbackPlan(gameTime);
}

function collectAvoidFightReasons(input: TacticalPlanInput, gameTime: number): TacticalPlanReason[] {
  const reasons: TacticalPlanReason[] = [];

  if (input.enemyThreat && input.enemyThreat.score >= 10) {
    reasons.push({
      kind: "threat",
      text: `${input.enemyThreat.championName} esta forte (${input.enemyThreat.kda}).`,
      confidence: "estimated",
      weight: 4,
    });
  }

  const activeAlliedDeaths = input.alliedDeaths.filter((death) => death.respawnAtSeconds > gameTime);
  for (const death of activeAlliedDeaths.slice(0, 2)) {
    reasons.push({
      kind: "death",
      text: `${death.championName} ainda esta morto.`,
      confidence: "confirmed",
      weight: 3,
    });
  }

  if (input.enemyPower - input.alliedPower >= 4) {
    reasons.push({
      kind: "powerspike",
      text: "O inimigo parece mais forte no momento.",
      confidence: "estimated",
      weight: 3,
    });
  }

  return reasons;
}

function findSoonObjective(objectives: ObjectiveState[]): ObjectiveState | null {
  return objectives.find((objective) => objective.available || /10|30|60|1 minuto|segundos/.test(objective.spawnIn)) ?? null;
}

function fallbackPlan(gameTime: number): TacticalPlan {
  return {
    intent: "farm_safe",
    priority: "low",
    summary: "Joga seguro e farma ate aparecer uma janela melhor.",
    confidence: "unknown",
    createdAtGameTimeSeconds: gameTime,
    expiresAtGameTimeSeconds: gameTime + 45,
    reasons: [{ kind: "fallback", text: "Contexto insuficiente para recomendar luta ou objetivo.", confidence: "unknown", weight: 0 }],
  };
}

function confidenceFromReasons(reasons: TacticalPlanReason[]): TacticalPlan["confidence"] {
  if (reasons.some((reason) => reason.confidence === "unknown")) return "unknown";
  if (reasons.some((reason) => reason.confidence === "estimated")) return "estimated";
  return "confirmed";
}

function score(reasons: TacticalPlanReason[]): number {
  return reasons.reduce((sum, reason) => sum + reason.weight, 0);
}

function safeGameTime(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
```

- [ ] **Step 4: Run planner tests**

Run: `npm test -- tests/tactical-plan.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/tactical-plan.ts tests/tactical-plan.test.ts
git commit -m "feat: add tactical plan decision rules"
```

### Task 3: Tactical Memory Cooldowns Influence Plans

**Files:**
- Modify: `src/core/tactical-plan.ts`
- Test: `tests/tactical-plan.test.ts`

- [ ] **Step 1: Add failing cooldown test**

Append to `tests/tactical-plan.test.ts`:

```ts
it("uses confirmed enemy cooldowns to strengthen objective preparation", () => {
  const plan = createTacticalPlan(baseInput({
    gameTimeSeconds: 700,
    objectiveStates: [{ name: "dragão", spawnIn: "30 segundos", available: false }],
    cooldowns: [{ champion: "Ashe", spell: "flash", isEnemy: true, confidence: "confirmed", readyAtSeconds: 850 }],
  }));

  expect(plan.intent).toBe("prepare_objective");
  expect(plan.priority).toBe("high");
  expect(plan.reasons).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "cooldown", text: expect.stringContaining("Ashe") }),
  ]));
  expect(plan.confidence).toBe("estimated");
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- tests/tactical-plan.test.ts`

Expected: FAIL because cooldown reasons are not used.

- [ ] **Step 3: Add cooldown reasons**

In `src/core/tactical-plan.ts`, add this helper:

```ts
function collectEnemyCooldownReasons(input: TacticalPlanInput, gameTime: number): TacticalPlanReason[] {
  return input.cooldowns
    .filter((cooldown) => cooldown.isEnemy && cooldown.readyAtSeconds > gameTime && cooldown.confidence !== "expired")
    .slice(0, 2)
    .map((cooldown) => ({
      kind: "cooldown" as const,
      text: `${cooldown.champion} esta sem ${cooldown.spell}.`,
      confidence: cooldown.confidence === "confirmed" ? "confirmed" : "estimated",
      weight: cooldown.confidence === "confirmed" ? 3 : 2,
    }));
}
```

Then in the objective branch, replace `const reasons: TacticalPlanReason[] = [...]` with:

```ts
const cooldownReasons = collectEnemyCooldownReasons(input, gameTime);
const reasons: TacticalPlanReason[] = [
  {
    kind: "objective",
    text: `${capitalize(objective.name)} esta em janela de preparacao.`,
    confidence: "estimated",
    weight: 4,
  },
  ...cooldownReasons,
];
```

And replace the objective priority line with:

```ts
priority: objective.available || score(cooldownReasons) >= 3 ? "high" : "medium",
```

- [ ] **Step 4: Run planner tests**

Run: `npm test -- tests/tactical-plan.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/tactical-plan.ts tests/tactical-plan.test.ts
git commit -m "feat: use tactical cooldowns in plans"
```

### Task 4: Engine Stores and Exposes Current Tactical Plan

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/services/engine.ts`
- Test: `tests/tactical-memory.test.ts`

- [ ] **Step 1: Add failing engine integration test**

In `tests/tactical-memory.test.ts`, add a test near existing engine integration tests:

```ts
it("stores the latest tactical plan in engine state", async () => {
  const { engine } = await import("../src/main/services/engine");
  const game = await import("../src/core/game.js");

  vi.mocked(game.getSnapshot).mockResolvedValueOnce(makeSnapshot({ gameTime: 540 }));

  await engine.start();
  await waitFor(() => engine.engineState.gameDetected === true);

  expect(engine.engineState.currentTacticalPlan).toEqual(expect.objectContaining({
    intent: expect.any(String),
    summary: expect.any(String),
    reasons: expect.any(Array),
  }));

  engine.stop();
});
```

If this file uses different helpers than `makeSnapshot` or `waitFor`, use the existing helper names already defined in `tests/tactical-memory.test.ts`; do not create duplicate helper concepts.

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- tests/tactical-memory.test.ts`

Expected: FAIL because `currentTacticalPlan` is missing.

- [ ] **Step 3: Add shared plan types**

In `src/shared/types.ts`, add tactical plan types after `EngineEvent`:

```ts
export type TacticalPlanIntent = "fight" | "avoid_fight" | "prepare_objective" | "trade_objective" | "reset" | "pressure_lane" | "farm_safe";
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

Extend `EngineState`:

```ts
currentTacticalPlan: TacticalPlan | null;
```

- [ ] **Step 4: Integrate planner in engine**

In `src/main/services/engine.ts`, update imports:

```ts
import type { ChampionCooldown, EngineState, EngineStatus, EngineEvent, LogEntry, TacticalCommandResult, TacticalMemoryContext } from "../../shared/types";
import { createTacticalPlan } from "../../core/tactical-plan";
import type { TacticalPlanInput } from "../../core/types";
```

Initialize `engineState`:

```ts
currentTacticalPlan: null,
```

Add a private method:

```ts
private buildTacticalPlanInput(snapshot: GameSnapshot, strategicContext: StrategicContext): TacticalPlanInput {
  const gameTimeSeconds = Math.floor(snapshot.gameTime);
  return {
    gameTimeSeconds,
    objectiveStates: strategicContext.objectiveStates,
    enemyThreat: strategicContext.enemyThreat,
    enemyThreats: strategicContext.enemyThreats,
    alliedPower: strategicContext.alliedPower,
    enemyPower: strategicContext.enemyPower,
    alliedDeaths: snapshot.alliedPlayers
      .filter((player) => player.championName && snapshot.activePlayerIsDead && player.championName === snapshot.activePlayerChampion)
      .map((player) => ({ championName: player.championName, isEnemy: false, respawnAtSeconds: gameTimeSeconds + Math.max(0, snapshot.activePlayerRespawnTimer) })),
    enemyDeaths: [],
    cooldowns: this.tacticalMemory.listCooldowns(gameTimeSeconds).map((cooldown) => ({
      champion: cooldown.champion,
      spell: cooldown.spell,
      isEnemy: cooldown.isEnemy,
      confidence: cooldown.confidence,
      readyAtSeconds: cooldown.readyAtSeconds,
    })),
  };
}
```

After `const { triggers: newTriggers, strategicContext } = await c.analyzeSnapshot(snapshot, st);`, add:

```ts
const currentTacticalPlan = createTacticalPlan(this.buildTacticalPlanInput(snapshot, strategicContext));
this.engineState.currentTacticalPlan = currentTacticalPlan;
```

On game ended, game reset, and `stop()`, set:

```ts
this.engineState.currentTacticalPlan = null;
```

- [ ] **Step 5: Run engine test**

Run: `npm test -- tests/tactical-memory.test.ts`

Expected: PASS. If helper names differ, adapt only the test helper usage, not the production behavior.

- [ ] **Step 6: Run typecheck**

Run: `rtk npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/main/services/engine.ts tests/tactical-memory.test.ts
git commit -m "feat: expose current tactical plan"
```

### Task 5: Coach Receives Tactical Plan Context

**Files:**
- Modify: `src/main/services/engine.ts`
- Modify: `src/core/coach.ts`
- Test: `tests/coach-message-modes.test.ts`

- [ ] **Step 1: Add failing coach prompt test**

In `tests/coach-message-modes.test.ts`, add:

```ts
it("includes tactical plan context in LLM prompts", async () => {
  const coachMod = await import("../src/core/coach.js");
  const configMod = await import("../src/core/config.js");
  configMod.settings.zaiApiKey = "test-key";
  configMod.settings.zaiEndpoint = "https://example.test/v1";
  configMod.settings.zaiModel = "test-model";

  const result = await coachMod.decideCoaching(
    makeSnapshot(),
    ["dragão em 1 minuto"],
    {
      activePlayer: { championName: "Jinx", build: [], majorItemCount: 1, majorItemIds: new Set(), majorItemDetails: [] },
      enemyBuilds: [],
      enemyThreat: null,
      enemyThreats: [],
      alliedPower: 10,
      enemyPower: 10,
      scalingRead: "neutro",
      objectiveStates: [{ name: "dragão", spawnIn: "60 segundos", available: false }],
      tacticalPlan: {
        intent: "prepare_objective",
        priority: "medium",
        summary: "Prepara dragão.",
        confidence: "estimated",
        createdAtGameTimeSeconds: 540,
        reasons: [{ kind: "objective", text: "Dragão em janela de preparação.", confidence: "estimated", weight: 4 }],
      },
    }
  );

  expect(result.prompt).toContain("Plano tatico atual");
  expect(result.prompt).toContain("prepare_objective");
  expect(result.prompt).toContain("Prepara dragão");
});
```

Use the existing `makeSnapshot` helper in that file. If no helper exists, add a minimal local helper matching the file's existing snapshot patterns.

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- tests/coach-message-modes.test.ts`

Expected: FAIL because prompt does not include tactical plan.

- [ ] **Step 3: Pass plan from engine to coach context**

In `src/main/services/engine.ts`, replace the `coachStrategicContext` block with:

```ts
const tacticalMemory = this.tacticalMemory.formatCoachContext(gameTime);
const coachStrategicContext = {
  ...strategicContext,
  ...(tacticalMemory ? { tacticalMemory } : {}),
  ...(this.engineState.currentTacticalPlan ? { tacticalPlan: this.engineState.currentTacticalPlan } : {}),
};
```

- [ ] **Step 4: Add prompt formatting in coach**

In `src/core/coach.ts`, add helper near other formatting helpers:

```ts
function formatTacticalPlanContext(ctx: StrategicContext): string {
  if (!ctx.tacticalPlan) return "";
  const plan = ctx.tacticalPlan;
  const reasons = plan.reasons.map((reason) => `- ${reason.text} (${reason.confidence})`).join("\n");
  return [
    "Plano tatico atual:",
    `Intencao: ${plan.intent}`,
    `Prioridade: ${plan.priority}`,
    `Confianca: ${plan.confidence}`,
    `Resumo: ${plan.summary}`,
    "Razoes:",
    reasons || "- Sem razoes estruturadas.",
    "Use este plano como fonte de verdade. Nao contradiga a intencao; apenas explique ou compacte a call.",
  ].join("\n");
}
```

Find the prompt construction inside `decideCoaching` and append this block wherever `strategicContext.tacticalMemory` or strategic context is already included:

```ts
const tacticalPlanContext = formatTacticalPlanContext(ctx);
```

Then include `tacticalPlanContext` in the final user prompt array/string, filtering empty parts the same way existing prompt sections are handled.

- [ ] **Step 5: Run coach tests**

Run: `npm test -- tests/coach-message-modes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/services/engine.ts src/core/coach.ts tests/coach-message-modes.test.ts
git commit -m "feat: add tactical plan to coach context"
```

### Task 6: Dashboard Tactical Plan Panel

**Files:**
- Create: `src/renderer/components/dashboard/TacticalPlanPanel.tsx`
- Modify: `src/renderer/pages/Dashboard.tsx`
- Test: `tests/tactical-plan-ui.test.ts`

- [ ] **Step 1: Add failing UI source test**

Create `tests/tactical-plan-ui.test.ts`:

```ts
import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("tactical plan UI", () => {
  it("renders tactical plan panel from dashboard", () => {
    const dashboard = readFileSync(new URL("../src/renderer/pages/Dashboard.tsx", import.meta.url), "utf8");
    const panel = readFileSync(new URL("../src/renderer/components/dashboard/TacticalPlanPanel.tsx", import.meta.url), "utf8");

    expect(dashboard).toContain("TacticalPlanPanel");
    expect(dashboard).toContain("<TacticalPlanPanel plan={engine.currentTacticalPlan} />");
    expect(panel).toContain("Plano atual");
    expect(panel).toContain("plan.reasons");
    expect(panel).toContain("confidenceLabel");
  });
});
```

- [ ] **Step 2: Run UI test to verify RED**

Run: `npm test -- tests/tactical-plan-ui.test.ts`

Expected: FAIL because panel does not exist.

- [ ] **Step 3: Create panel**

Create `src/renderer/components/dashboard/TacticalPlanPanel.tsx`:

```tsx
import type { TacticalPlan } from "../../../shared/types";

export default function TacticalPlanPanel({ plan }: { plan: TacticalPlan | null }) {
  const intentLabel = plan ? formatIntent(plan.intent) : "Sem plano";
  const confidenceLabel = plan ? formatConfidence(plan.confidence) : "desconhecida";

  return (
    <section className="card-glass w-full max-w-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Plano atual
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-primary)" }}>
            {intentLabel}
          </p>
        </div>
        <span className="rounded-full px-3 py-1 text-xs" style={{ color: "var(--text-secondary)", background: "var(--bg-input)" }}>
          {plan?.priority ?? "low"} · {confidenceLabel}
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {plan?.summary ?? "Ainda nao ha contexto suficiente para um plano tatico."}
      </p>

      {plan && plan.reasons.length > 0 ? (
        <div className="mt-4 space-y-2">
          {plan.reasons.map((reason, index) => (
            <p key={`${reason.kind}-${index}`} className="rounded-lg px-3 py-2 text-xs" style={{ color: "var(--text-muted)", background: "var(--bg-input)" }}>
              {reason.text}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function formatIntent(intent: TacticalPlan["intent"]): string {
  switch (intent) {
    case "fight": return "Procurar luta";
    case "avoid_fight": return "Evitar luta";
    case "prepare_objective": return "Preparar objetivo";
    case "trade_objective": return "Trocar objetivo";
    case "reset": return "Resetar";
    case "pressure_lane": return "Pressionar lane";
    case "farm_safe": return "Farmar seguro";
  }
}

function formatConfidence(confidence: TacticalPlan["confidence"]): string {
  switch (confidence) {
    case "confirmed": return "confirmado";
    case "estimated": return "estimado";
    case "unknown": return "incerto";
  }
}
```

- [ ] **Step 4: Mount panel in dashboard**

Modify `src/renderer/pages/Dashboard.tsx` imports:

```tsx
import TacticalPlanPanel from "../components/dashboard/TacticalPlanPanel";
```

Add `currentTacticalPlan: null` to `DEFAULT_STATE`.

Add after the last message block and before tactical memory:

```tsx
<div className="animate-in animate-in-delay-4 relative z-10 mt-8 w-full max-w-lg">
  <TacticalPlanPanel plan={engine.currentTacticalPlan} />
</div>
```

- [ ] **Step 5: Run UI and typecheck**

Run: `npm test -- tests/tactical-plan-ui.test.ts`

Expected: PASS.

Run: `rtk npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/dashboard/TacticalPlanPanel.tsx src/renderer/pages/Dashboard.tsx tests/tactical-plan-ui.test.ts
git commit -m "feat: show current tactical plan"
```

### Task 7: Final Verification and Merge Prep

**Files:**
- Review all changed files.
- No new production file unless verification reveals a bug.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- tests/tactical-plan.test.ts tests/tactical-plan-ui.test.ts tests/tactical-memory.test.ts tests/coach-message-modes.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 2: Run full verification**

Run:

```bash
rtk npm run typecheck
npm test
rtk npm run build
```

Expected:

- Typecheck exits 0.
- Full tests pass.
- Build exits 0. Existing Vite dynamic/static import warnings are acceptable if unchanged.

- [ ] **Step 3: Inspect final git status**

Run:

```bash
git status --short --branch
git log --oneline -8
```

Expected: branch contains the Phase 4 commits and no unexpected unrelated staged files.

- [ ] **Step 4: Request code review**

Use `superpowers:requesting-code-review` and ask the reviewer to focus on:

- Planner determinism and conservative fallback.
- Tactical memory influence without duplicating memory logic.
- Coach prompt not allowing LLM contradiction.
- Dashboard state safety when plan is null.
- Test coverage for planner, engine, coach, and UI.

- [ ] **Step 5: Address review feedback with TDD**

For each Critical or Important finding:

1. Write or adjust a failing test that reproduces the issue.
2. Run the test and confirm it fails for the expected reason.
3. Apply the smallest fix.
4. Rerun the focused test.
5. Rerun full verification if the fix touches shared types, engine, coach, or UI.

- [ ] **Step 6: Commit review fixes if needed**

```bash
git add src/core/tactical-plan.ts src/core/types.ts src/shared/types.ts src/main/services/engine.ts src/core/coach.ts src/renderer/components/dashboard/TacticalPlanPanel.tsx src/renderer/pages/Dashboard.tsx tests/tactical-plan.test.ts tests/tactical-memory.test.ts tests/coach-message-modes.test.ts tests/tactical-plan-ui.test.ts
git commit -m "fix: harden tactical plan integration"
```

Only run this commit if review fixes changed files.

## Notes for Execution

- Use a new worktree for implementation, for example `.worktrees/ferro-phase-4-tactical-plan`, before editing code.
- Follow TDD for every behavior change. Do not write production code before watching the corresponding test fail.
- Keep the planner deterministic. The LLM formats the plan; it does not choose the plan.
- Do not introduce Riot API, champion matchup database, overlay, or advanced wave-state work in this phase.
- Do not commit unrelated local files such as `.opencode/`, `.superpowers/`, `ROADMAP_FERRO_EVOLUCAO.md`, or local `.gitignore` changes unless the user explicitly asks.
