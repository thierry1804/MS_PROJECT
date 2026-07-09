import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR } from "./calendar";
import { computeSchedule } from "./cpm";
import { computeEvmSeries, computeMetrics } from "./metrics";
import type { Dependency, Resource, Task } from "./types";

const dev: Resource = { id: "r1", name: "Dev", kind: "work", capacity: 1, costPerDay: 100 };

function leaf(id: string, order: number, duration: number, pct: number, extra: Partial<Task> = {}): Task {
  return {
    id,
    name: id,
    parentId: null,
    order,
    duration,
    percentComplete: pct,
    assignments: [{ resourceId: "r1", units: 1 }],
    ...extra,
  };
}

describe("EVM metrics", () => {
  it("PV reflects the status date, not the whole budget", () => {
    // Two 10-day tasks in series (A then B). Each costs 10 × 100 = 1000. BAC = 2000.
    const tasks = [leaf("a", 0, 10, 100), leaf("b", 1, 10, 0)];
    const deps: Dependency[] = [{ predecessorId: "a", successorId: "b", type: "FS", lag: 0 }];
    const schedule = computeSchedule({
      tasks,
      dependencies: deps,
      calendar: DEFAULT_CALENDAR,
      projectStart: "2026-01-05", // a Monday
    });
    // Status date at the boundary: A fully scheduled, B not started.
    const bDate = schedule.tasks.get("b")!.startDate;
    const m = computeMetrics(tasks, schedule, [dev], {
      calendar: DEFAULT_CALENDAR,
      projectStart: "2026-01-05",
      statusDate: bDate,
    });
    expect(m.bac).toBe(2000);
    expect(m.pv).toBeCloseTo(1000, 0); // only A scheduled by status date
    expect(m.earnedValue).toBeCloseTo(1000, 0); // A is 100% done
    expect(m.spi).toBeCloseTo(1, 2); // on schedule: EV == PV
  });

  it("SPI < 1 when work is behind the plan", () => {
    const tasks = [leaf("a", 0, 10, 20)]; // scheduled done but only 20% complete
    const schedule = computeSchedule({
      tasks,
      dependencies: [],
      calendar: DEFAULT_CALENDAR,
      projectStart: "2026-01-05",
    });
    const m = computeMetrics(tasks, schedule, [dev], {
      calendar: DEFAULT_CALENDAR,
      projectStart: "2026-01-05",
      statusDate: "2026-03-01", // well past finish → PV = full cost
    });
    expect(m.pv).toBeCloseTo(1000, 0);
    expect(m.earnedValue).toBeCloseTo(200, 0);
    expect(m.spi).toBeCloseTo(0.2, 2);
  });

  it("CPI < 1 when actual cost exceeds earned value", () => {
    const tasks = [leaf("a", 0, 10, 50, { actualCost: 800 })];
    const schedule = computeSchedule({
      tasks,
      dependencies: [],
      calendar: DEFAULT_CALENDAR,
      projectStart: "2026-01-05",
    });
    const m = computeMetrics(tasks, schedule, [dev], {
      calendar: DEFAULT_CALENDAR,
      projectStart: "2026-01-05",
      statusDate: "2026-03-01",
    });
    expect(m.earnedValue).toBeCloseTo(500, 0);
    expect(m.ac).toBe(800);
    expect(m.cpi).toBeCloseTo(0.625, 3);
    expect(m.eac).toBeCloseTo(1600, 0); // BAC / CPI = 1000 / 0.625
  });
});

describe("EVM S-curve series", () => {
  it("PV is non-decreasing and ends near BAC", () => {
    const tasks = [leaf("a", 0, 10, 100), leaf("b", 1, 10, 50)];
    const deps: Dependency[] = [{ predecessorId: "a", successorId: "b", type: "FS", lag: 0 }];
    const schedule = computeSchedule({
      tasks,
      dependencies: deps,
      calendar: DEFAULT_CALENDAR,
      projectStart: "2026-01-05",
    });
    const series = computeEvmSeries(tasks, schedule, [dev], {
      calendar: DEFAULT_CALENDAR,
      projectStart: "2026-01-05",
      statusDate: "2026-01-20",
    });
    expect(series.length).toBeGreaterThan(2);
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!.pv).toBeGreaterThanOrEqual(series[i - 1]!.pv - 1e-6);
    }
    expect(series[series.length - 1]!.pv).toBeCloseTo(2000, 0);
  });

  it("AC follows timesheet cumulative cost", () => {
    const tasks = [leaf("a", 0, 10, 50, { actualCost: 999 })];
    const schedule = computeSchedule({
      tasks,
      dependencies: [],
      calendar: DEFAULT_CALENDAR,
      projectStart: "2026-01-05",
    });
    const series = computeEvmSeries(tasks, schedule, [dev], {
      calendar: DEFAULT_CALENDAR,
      projectStart: "2026-01-05",
      statusDate: "2026-01-20",
      timesheets: [
        { taskId: "a", resourceId: "r1", weekStart: "2026-01-05", days: 3 },
        { taskId: "a", resourceId: "r1", weekStart: "2026-01-12", days: 2 },
      ],
    });
    const beforeSecond = series.find((p) => p.date === "2026-01-05");
    const afterSecond = series.find((p) => p.date >= "2026-01-12");
    expect(beforeSecond?.ac).toBe(300);
    expect(afterSecond?.ac).toBeGreaterThanOrEqual(500);
  });
});
