import { describe, expect, it } from "vitest";
import type { Portfolio, Project } from "../domain";
import { buildProjectContext } from "./context";
import { runHeuristics } from "./heuristics";

function emptyProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    code: "TST",
    name: "Projet test",
    description: "",
    manager: "Alice",
    status: "en-cours",
    health: "green",
    budget: 100_000,
    projectStart: "2026-01-06",
    tasks: [],
    dependencies: [],
    risks: [],
    actions: [],
    issues: [],
    decisions: [],
    ...overrides,
  };
}

const portfolio: Portfolio = {
  name: "Test",
  calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
  resources: [
    { id: "r1", name: "Dev", kind: "work", costPerDay: 500, capacity: 1 },
  ],
  projects: [],
};

describe("runHeuristics", () => {
  it("propose un risque budget quand CPI est bas", () => {
    const project = emptyProject({
      tasks: [
        {
          id: "t1",
          name: "Dev",
          parentId: null,
          order: 0,
          duration: 10,
          percentComplete: 50,
          assignments: [{ resourceId: "r1", units: 1 }],
          actualCost: 8000,
        },
      ],
    });
    portfolio.projects = [project];
    const ctx = buildProjectContext(project, portfolio);
    expect(ctx.cpi).toBeLessThan(0.9);
    const suggestions = runHeuristics(ctx);
    expect(suggestions.some((s) => s.category === "Budget")).toBe(true);
  });

  it("propose un risque planning pour tâches en retard baseline", () => {
    const project = emptyProject({
      baselineCapturedAt: "2026-01-10",
      tasks: [
        {
          id: "t1",
          name: "Phase 1",
          parentId: null,
          order: 0,
          duration: 5,
          percentComplete: 30,
          assignments: [{ resourceId: "r1", units: 1 }],
          baseline: { start: "2026-01-06", finish: "2026-01-10", cost: 2500 },
        },
      ],
    });
    portfolio.projects = [project];
    const ctx = buildProjectContext(project, portfolio);
    const suggestions = runHeuristics(ctx);
    expect(suggestions.some((s) => s.category === "Planning")).toBe(true);
  });

  it("ignore les doublons déjà dans le registre", () => {
    const project = emptyProject({
      health: "red",
      risks: [
        {
          id: "r1",
          label: "Risque de dérive globale du projet (santé rouge)",
          probability: 4,
          impact: 4,
          owner: "Alice",
          status: "ouvert",
          category: "Organisation",
        },
      ],
    });
    portfolio.projects = [project];
    const ctx = buildProjectContext(project, portfolio);
    const suggestions = runHeuristics(ctx);
    expect(suggestions.some((s) => s.label.includes("santé rouge"))).toBe(false);
  });

  it("crée plusieurs suggestions depuis userHint", () => {
    const project = emptyProject();
    portfolio.projects = [project];
    const ctx = buildProjectContext(project, portfolio);
    const suggestions = runHeuristics(ctx, "inquiétude RGPD sur les données clients");
    expect(suggestions.some((s) => s.category === "Conformité")).toBe(true);
    expect(suggestions.length).toBeGreaterThanOrEqual(2);
  });
});
