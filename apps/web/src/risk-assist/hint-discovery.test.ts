import { describe, expect, it } from "vitest";
import type { Portfolio, Project } from "../domain";
import { buildProjectContext } from "./context";
import { expandUserHintRisks } from "./hint-discovery";
import { runHeuristics } from "./heuristics";

function emptyProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    code: "TST",
    name: "Projet test",
    description: "Refonte ERP",
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
  resources: [{ id: "r1", name: "Dev", kind: "work", costPerDay: 500, capacity: 1 }],
  projects: [],
};

describe("expandUserHintRisks", () => {
  it("décompose une inquiétude fournisseur en plusieurs risques corrélés", () => {
    const project = emptyProject();
    portfolio.projects = [project];
    const ctx = buildProjectContext(project, portfolio);
    const risks = expandUserHintRisks(ctx, "retard fournisseur ERP sur la livraison des modules");
    expect(risks.length).toBeGreaterThanOrEqual(3);
    expect(risks.some((r) => r.category === "Fournisseur")).toBe(true);
    expect(risks.some((r) => r.category === "Planning")).toBe(true);
  });

  it("propose des risques conformité pour une inquiétude RGPD", () => {
    const project = emptyProject();
    portfolio.projects = [project];
    const ctx = buildProjectContext(project, portfolio);
    const risks = expandUserHintRisks(ctx, "inquiétude RGPD sur les données clients");
    expect(risks.some((r) => r.category === "Conformité")).toBe(true);
    expect(risks.length).toBeGreaterThanOrEqual(2);
  });
});

describe("runHeuristics avec userHint", () => {
  it("retourne plusieurs suggestions pour une inquiétude", () => {
    const project = emptyProject();
    portfolio.projects = [project];
    const ctx = buildProjectContext(project, portfolio);
    const suggestions = runHeuristics(ctx, "Le fournisseur ERP pourrait livrer en retard");
    expect(suggestions.length).toBeGreaterThanOrEqual(3);
  });
});
