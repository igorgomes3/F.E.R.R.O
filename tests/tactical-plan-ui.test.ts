import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("tactical plan dashboard UI", () => {
  it("renders the current tactical plan on Dashboard", () => {
    const dashboardSource = readFileSync(new URL("../src/renderer/pages/Dashboard.tsx", import.meta.url), "utf8");
    const panelSource = readFileSync(new URL("../src/renderer/components/dashboard/TacticalPlanPanel.tsx", import.meta.url), "utf8");

    expect(dashboardSource).toContain("TacticalPlanPanel");
    expect(dashboardSource).toContain("<TacticalPlanPanel plan={engine.currentTacticalPlan} />");
    expect(panelSource).toContain("Plano atual");
    expect(panelSource).toContain("plan.reasons");
    expect(panelSource).toContain("confidenceLabel");
  });
});
