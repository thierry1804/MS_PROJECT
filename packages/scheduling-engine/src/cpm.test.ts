import { describe, expect, it } from "vitest";
import { computeSchedule } from "./cpm";
import { DEFAULT_CALENDAR, dateToIndex, indexToDate, workingDaysBetween } from "./calendar";
import { computeMetrics } from "./metrics";
import type { Dependency, Resource, ScheduledTask, ScheduleResult, Task } from "./types";

function task(id: string, duration: number, over: Partial<Task> = {}): Task {
  return {
    id,
    name: id,
    parentId: null,
    order: 0,
    duration,
    percentComplete: 0,
    assignments: [],
    ...over,
  };
}

const dep = (p: string, s: string, type: Dependency["type"] = "FS", lag = 0): Dependency => ({
  predecessorId: p,
  successorId: s,
  type,
  lag,
});

// 2026-01-05 is a Monday.
const START = "2026-01-05";

describe("calendar", () => {
  it("skips weekends", () => {
    expect(indexToDate(DEFAULT_CALENDAR, START, 0)).toBe("2026-01-05");
    expect(indexToDate(DEFAULT_CALENDAR, START, 4)).toBe("2026-01-09"); // Friday
    expect(indexToDate(DEFAULT_CALENDAR, START, 5)).toBe("2026-01-12"); // Monday
  });

  it("skips holidays", () => {
    const cal = { ...DEFAULT_CALENDAR, holidays: ["2026-01-06"] };
    expect(indexToDate(cal, START, 1)).toBe("2026-01-07");
  });

  it("rounds a weekend start forward", () => {
    expect(indexToDate(DEFAULT_CALENDAR, "2026-01-03", 0)).toBe("2026-01-05");
  });

  it("dateToIndex inverts indexToDate", () => {
    for (const i of [0, 1, 7, 23]) {
      expect(dateToIndex(DEFAULT_CALENDAR, START, indexToDate(DEFAULT_CALENDAR, START, i))).toBe(i);
    }
  });

  it("counts working days in a half-open range", () => {
    expect(workingDaysBetween(DEFAULT_CALENDAR, "2026-01-05", "2026-01-12")).toBe(5);
  });
});

describe("computeSchedule — FS chain", () => {
  it("chains sequential tasks and marks all critical", () => {
    const r = computeSchedule({
      tasks: [task("a", 2, { order: 0 }), task("b", 3, { order: 1 }), task("c", 1, { order: 2 })],
      dependencies: [dep("a", "b"), dep("b", "c")],
      calendar: DEFAULT_CALENDAR,
      projectStart: START,
    });
    expect(r.errors).toEqual([]);
    expect(r.tasks.get("a")).toMatchObject({ es: 0, ef: 2, critical: true });
    expect(r.tasks.get("b")).toMatchObject({ es: 2, ef: 5, critical: true });
    expect(r.tasks.get("c")).toMatchObject({ es: 5, ef: 6, critical: true });
    expect(r.projectDuration).toBe(6);
    // 6 working days from Mon 01-05 → finishes Mon 01-12.
    expect(r.projectFinishDate).toBe("2026-01-12");
  });

  it("computes slack on parallel branch", () => {
    const r = computeSchedule({
      tasks: [task("a", 5, { order: 0 }), task("b", 2, { order: 1 }), task("end", 1, { order: 2 })],
      dependencies: [dep("a", "end"), dep("b", "end")],
      calendar: DEFAULT_CALENDAR,
      projectStart: START,
    });
    expect(r.tasks.get("a")!.slack).toBe(0);
    expect(r.tasks.get("a")!.critical).toBe(true);
    expect(r.tasks.get("b")!.slack).toBe(3);
    expect(r.tasks.get("b")!.critical).toBe(false);
  });
});

describe("dependency types and lag", () => {
  it("FS with lag", () => {
    const r = computeSchedule({
      tasks: [task("a", 2, { order: 0 }), task("b", 1, { order: 1 })],
      dependencies: [dep("a", "b", "FS", 3)],
      calendar: DEFAULT_CALENDAR,
      projectStart: START,
    });
    expect(r.tasks.get("b")!.es).toBe(5);
  });

  it("SS aligns starts", () => {
    const r = computeSchedule({
      tasks: [task("a", 4, { order: 0 }), task("b", 2, { order: 1 })],
      dependencies: [dep("a", "b", "SS", 1)],
      calendar: DEFAULT_CALENDAR,
      projectStart: START,
    });
    expect(r.tasks.get("b")!.es).toBe(1);
  });

  it("FF aligns finishes", () => {
    const r = computeSchedule({
      tasks: [task("a", 4, { order: 0 }), task("b", 2, { order: 1 })],
      dependencies: [dep("a", "b", "FF")],
      calendar: DEFAULT_CALENDAR,
      projectStart: START,
    });
    expect(r.tasks.get("b")!.ef).toBe(4);
    expect(r.tasks.get("b")!.es).toBe(2);
  });

  it("SF: successor finishes when predecessor starts (plus lag)", () => {
    const r = computeSchedule({
      tasks: [task("a", 3, { order: 0, constraint: { type: "SNET", date: "2026-01-12" } }), task("b", 2, { order: 1 })],
      dependencies: [dep("a", "b", "SF")],
      calendar: DEFAULT_CALENDAR,
      projectStart: START,
    });
    // a starts index 5 → b must finish by 5 → es 3.
    expect(r.tasks.get("b")!.ef).toBe(5);
    expect(r.tasks.get("b")!.es).toBe(3);
  });

  it("negative lag (lead) overlaps tasks", () => {
    const r = computeSchedule({
      tasks: [task("a", 4, { order: 0 }), task("b", 2, { order: 1 })],
      dependencies: [dep("a", "b", "FS", -2)],
      calendar: DEFAULT_CALENDAR,
      projectStart: START,
    });
    expect(r.tasks.get("b")!.es).toBe(2);
  });
});

describe("milestones, summaries, WBS", () => {
  it("milestone has zero span and same start/finish date", () => {
    const r = computeSchedule({
      tasks: [task("a", 3, { order: 0 }), task("m", 0, { order: 1 })],
      dependencies: [dep("a", "m")],
      calendar: DEFAULT_CALENDAR,
      projectStart: START,
    });
    const m = r.tasks.get("m")!;
    expect(m.isMilestone).toBe(true);
    expect(m.es).toBe(3);
    expect(m.startDate).toBe(m.finishDate);
  });

  it("summary rolls up children and WBS codes nest", () => {
    const r = computeSchedule({
      tasks: [
        task("phase", 0, { order: 0 }),
        task("a", 2, { order: 0, parentId: "phase" }),
        task("b", 3, { order: 1, parentId: "phase" }),
        task("after", 1, { order: 1 }),
      ],
      dependencies: [dep("a", "b"), dep("phase", "after")],
      calendar: DEFAULT_CALENDAR,
      projectStart: START,
    });
    const s = r.tasks.get("phase")!;
    expect(s.isSummary).toBe(true);
    expect(s.es).toBe(0);
    expect(s.ef).toBe(5);
    expect(r.tasks.get("a")!.wbs).toBe("1.1");
    expect(r.tasks.get("b")!.wbs).toBe("1.2");
    // Dependency on summary expands to its leaves: "after" waits for b.
    expect(r.tasks.get("after")!.es).toBe(5);
  });
});

describe("EVM metrics", () => {
  const resource: Resource = { id: "r1", name: "Dev", kind: "work", capacity: 1, costPerDay: 100 };

  function makeSchedule(tasks: { id: string; duration: number }[]): ScheduleResult {
    const map = new Map<string, ScheduledTask>();
    tasks.forEach(({ id, duration }) => {
      map.set(id, {
        id, es: 0, ef: duration, ls: 0, lf: duration,
        slack: 0, critical: true, isSummary: false, isMilestone: false,
        duration, startDate: START, finishDate: START, wbs: "1", level: 0,
      });
    });
    return { tasks: map, projectDuration: 10, projectFinishDate: START, outline: tasks.map(t => t.id), errors: [] };
  }

  function makeTask(id: string, pct: number, overrides: Partial<Task> = {}): Task {
    return { id, name: id, parentId: null, order: 0, duration: 10, percentComplete: pct, assignments: [{ resourceId: "r1", units: 1 }], ...overrides };
  }

  it("no actualCost → CPI=1, CV=0, SPI reflects EV/BAC", () => {
    const tasks = [makeTask("t1", 50)];
    const schedule = makeSchedule([{ id: "t1", duration: 10 }]);
    const m = computeMetrics(tasks, schedule, [resource]);
    // BAC = 10 × 100 = 1000; EV = 500; AC = EV (no actualCost) = 500
    expect(m.bac).toBe(1000);
    expect(m.earnedValue).toBe(500);
    expect(m.ac).toBe(500);
    expect(m.cpi).toBeCloseTo(1, 5);
    expect(m.cv).toBeCloseTo(0, 5);
    expect(m.spi).toBeCloseTo(0.5, 5);
  });

  it("actualCost > EV → CPI<1, EAC>BAC, CV negative", () => {
    const tasks = [makeTask("t1", 50, { actualCost: 600 })];
    const schedule = makeSchedule([{ id: "t1", duration: 10 }]);
    const m = computeMetrics(tasks, schedule, [resource]);
    // EV=500, AC=600 → CPI=500/600≈0.833
    expect(m.ac).toBe(600);
    expect(m.cpi).toBeCloseTo(500 / 600, 5);
    expect(m.eac).toBeCloseTo(1000 / (500 / 600), 3);
    expect(m.cv).toBeCloseTo(500 - 600, 5);
    expect(m.cpi).toBeLessThan(1);
    expect(m.eac).toBeGreaterThan(m.bac);
  });

  it("100% complete, no actualCost → EV=BAC, ETC≈0, CPI=1", () => {
    const tasks = [makeTask("t1", 100), makeTask("t2", 100)];
    const schedule = makeSchedule([{ id: "t1", duration: 10 }, { id: "t2", duration: 5 }]);
    const m = computeMetrics(tasks, schedule, [resource]);
    // BAC = 10×100 + 5×100 = 1500; EV = 1500; AC = 1500
    expect(m.earnedValue).toBeCloseTo(m.bac, 5);
    expect(m.cpi).toBeCloseTo(1, 5);
    expect(m.etc).toBeCloseTo(0, 5);
    expect(m.sv).toBeCloseTo(0, 5);
  });
});

describe("constraints and errors", () => {
  it("SNET pushes start", () => {
    const r = computeSchedule({
      tasks: [task("a", 2, { order: 0, constraint: { type: "SNET", date: "2026-01-12" } })],
      dependencies: [],
      calendar: DEFAULT_CALENDAR,
      projectStart: START,
    });
    expect(r.tasks.get("a")!.es).toBe(5);
  });

  it("detects cycles", () => {
    const r = computeSchedule({
      tasks: [task("a", 1, { order: 0 }), task("b", 1, { order: 1 })],
      dependencies: [dep("a", "b"), dep("b", "a")],
      calendar: DEFAULT_CALENDAR,
      projectStart: START,
    });
    expect(r.errors.some((e) => e.kind === "cycle")).toBe(true);
  });
});
