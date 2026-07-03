import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR } from "./calendar";
import { computeSchedule } from "./cpm";
import { detectOverallocations, levelResources } from "./leveling";
import type { Resource, Task } from "./types";

const dev: Resource = { id: "r1", name: "Dev", kind: "work", capacity: 1, costPerDay: 100 };

function leaf(id: string, order: number, duration: number, units = 1): Task {
  return {
    id,
    name: id,
    parentId: null,
    order,
    duration,
    percentComplete: 0,
    assignments: [{ resourceId: "r1", units }],
  };
}

const START = "2026-01-05"; // Monday

describe("resource leveling", () => {
  it("detects a same-resource overlap as overallocation", () => {
    const tasks = [leaf("a", 0, 5), leaf("b", 1, 5)]; // both start at index 0
    const schedule = computeSchedule({ tasks, dependencies: [], calendar: DEFAULT_CALENDAR, projectStart: START });
    const over = detectOverallocations(tasks, schedule, [dev]);
    expect(over.length).toBeGreaterThan(0);
    expect(over.every((o) => o.load === 2 && o.capacity === 1)).toBe(true);
  });

  it("serialises the conflict by delaying the second task", () => {
    const tasks = [leaf("a", 0, 5), leaf("b", 1, 5)];
    const schedule = computeSchedule({ tasks, dependencies: [], calendar: DEFAULT_CALENDAR, projectStart: START });
    const proposals = levelResources(tasks, schedule, [dev], DEFAULT_CALENDAR, START);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.taskId).toBe("b");
    expect(proposals[0]!.delayDays).toBe(5); // b pushed to start after a (index 5)
  });

  it("applying the SNET constraint clears the overallocation", () => {
    const tasks = [leaf("a", 0, 5), leaf("b", 1, 5)];
    const s0 = computeSchedule({ tasks, dependencies: [], calendar: DEFAULT_CALENDAR, projectStart: START });
    const [prop] = levelResources(tasks, s0, [dev], DEFAULT_CALENDAR, START);
    const leveled = tasks.map((t) =>
      t.id === prop!.taskId ? { ...t, constraint: { type: "SNET" as const, date: prop!.notBefore } } : t,
    );
    const s1 = computeSchedule({ tasks: leveled, dependencies: [], calendar: DEFAULT_CALENDAR, projectStart: START });
    expect(detectOverallocations(leveled, s1, [dev])).toHaveLength(0);
  });

  it("half-capacity assignments can run in parallel without conflict", () => {
    const tasks = [leaf("a", 0, 5, 0.5), leaf("b", 1, 5, 0.5)];
    const schedule = computeSchedule({ tasks, dependencies: [], calendar: DEFAULT_CALENDAR, projectStart: START });
    expect(detectOverallocations(tasks, schedule, [dev])).toHaveLength(0);
    expect(levelResources(tasks, schedule, [dev], DEFAULT_CALENDAR, START)).toHaveLength(0);
  });
});
