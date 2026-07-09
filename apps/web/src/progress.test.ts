import { describe, expect, it } from "vitest";
import { computeSchedule, DEFAULT_CALENDAR } from "@atelier/scheduling-engine";
import type { Task } from "@atelier/scheduling-engine";
import { applyProgressMode, progressDiverges, scheduledPercentOf } from "./progress";
import type { Project } from "./domain";

function leaf(id: string, order: number, duration: number, pct: number, parentId: string | null = null): Task {
  return {
    id,
    name: id,
    parentId,
    order,
    duration,
    percentComplete: pct,
    assignments: [],
  };
}

function baseProject(tasks: Task[]): Project {
  return {
    id: "p1",
    code: "P1",
    name: "Test",
    description: "",
    manager: "A",
    status: "en-cours",
    health: "green",
    budget: 10000,
    projectStart: "2026-01-05",
    tasks,
    dependencies: [],
    risks: [],
    actions: [],
    issues: [],
    decisions: [],
  };
}

describe("guided progress", () => {
  it("flags divergence vs scheduled percent", () => {
    const tasks = [leaf("a", 0, 10, 10)];
    const schedule = computeSchedule({
      tasks,
      dependencies: [],
      calendar: DEFAULT_CALENDAR,
      projectStart: "2026-01-05",
    });
    const planned = scheduledPercentOf(tasks[0]!, schedule, DEFAULT_CALENDAR, "2026-01-05", "2026-03-01");
    expect(planned).toBe(100);
    expect(progressDiverges(tasks[0]!, schedule, DEFAULT_CALENDAR, "2026-01-05", "2026-03-01")).toBe(true);
  });

  it("milestones mode rolls up sibling milestone completion", () => {
    const tasks = [
      leaf("sum", 0, 0, 0),
      leaf("m1", 0, 0, 100, "sum"),
      leaf("m2", 1, 0, 0, "sum"),
      leaf("work", 2, 5, 0, "sum"),
    ];
    // Force milestone detection via duration 0
    const schedule = computeSchedule({
      tasks,
      dependencies: [],
      calendar: DEFAULT_CALENDAR,
      projectStart: "2026-01-05",
    });
    const project = baseProject(tasks);
    const next = applyProgressMode(project, schedule, "milestones");
    const work = next.find((t) => t.id === "work")!;
    expect(work.percentComplete).toBe(50);
  });

  it("effort mode uses timesheet days over duration", () => {
    const tasks = [leaf("a", 0, 10, 0)];
    const schedule = computeSchedule({
      tasks,
      dependencies: [],
      calendar: DEFAULT_CALENDAR,
      projectStart: "2026-01-05",
    });
    const project: Project = {
      ...baseProject(tasks),
      timesheets: [{ id: "1", taskId: "a", resourceId: "r1", weekStart: "2026-01-05", days: 4 }],
    };
    const next = applyProgressMode(project, schedule, "effort");
    expect(next[0]!.percentComplete).toBe(40);
  });
});
