import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR, computeSchedule } from "@atelier/scheduling-engine";
import {
  IMPORT_TEMPLATE,
  parseCsvText,
  parseImportDate,
  parseImportRows,
} from "./import";
import { daysToHours, parseDurationDays } from "./duration";

const opts = {
  projectId: "refonte",
  calendar: DEFAULT_CALENDAR,
  projectStart: "2026-07-01",
};

describe("parseImportDate", () => {
  it("parses dd/mm/yyyy", () => {
    expect(parseImportDate("01/07/2026")).toBe("2026-07-01");
    expect(parseImportDate("15/07/2026")).toBe("2026-07-15");
  });

  it("parses yyyy-mm-dd", () => {
    expect(parseImportDate("2026-07-01")).toBe("2026-07-01");
  });

  it("returns null for invalid dates", () => {
    expect(parseImportDate("bad")).toBeNull();
  });
});

describe("parseImportRows", () => {
  it("imports the user example with 8 tasks", () => {
    const rows = parseCsvText(IMPORT_TEMPLATE);
    expect(rows.length).toBe(9);
    const { tasks, errors } = parseImportRows(rows, opts);
    expect(errors).toEqual([]);
    expect(tasks).toHaveLength(8);
  });

  it("builds WBS hierarchy", () => {
    const rows = parseCsvText(IMPORT_TEMPLATE);
    const { tasks } = parseImportRows(rows, opts);
    const phase1 = tasks.find((t) => t.id === "refonte-wbs-1");
    const task11 = tasks.find((t) => t.id === "refonte-wbs-1-1");
    expect(phase1?.parentId).toBeNull();
    expect(task11?.parentId).toBe("refonte-wbs-1");
    expect(task11?.duration).toBe(3);
  });

  it("applies MSO on milestone with Début", () => {
    const rows = parseCsvText(IMPORT_TEMPLATE);
    const { tasks } = parseImportRows(rows, opts);
    const jalon = tasks.find((t) => t.id === "refonte-wbs-1-3");
    expect(jalon?.duration).toBe(0);
    expect(jalon?.constraint).toEqual({ type: "MSO", date: "2026-07-15" });
  });

  it("propagates groupement Début as MSO on first leaf", () => {
    const rows = parseCsvText(IMPORT_TEMPLATE);
    const { tasks } = parseImportRows(rows, opts);
    const first = tasks.find((t) => t.id === "refonte-wbs-1-1");
    expect(first?.constraint).toEqual({ type: "MSO", date: "2026-07-01" });
  });

  it("accepts Récap alias for groupement", () => {
    const csv = `WBS;Type;Nom;Durée (j);Début;Fin
1;Récap;Phase;;;
1.1;Tâche;Work;2;;`;
    const { tasks, errors } = parseImportRows(parseCsvText(csv), opts);
    expect(errors).toEqual([]);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]!.duration).toBe(0);
  });

  it("rejects missing parent WBS", () => {
    const csv = `WBS;Type;Nom;Durée (j);Début;Fin
1.1;Tâche;Orphelin;2;;`;
    const { errors } = parseImportRows(parseCsvText(csv), opts);
    expect(errors.some((e) => e.message.includes("Parent WBS introuvable"))).toBe(true);
  });

  it("rejects task without duration", () => {
    const csv = `WBS;Type;Nom;Durée (j);Début;Fin
1;Tâche;Sans durée;;;`;
    const { errors } = parseImportRows(parseCsvText(csv), opts);
    expect(errors.some((e) => e.message.includes("Durée obligatoire"))).toBe(true);
  });

  it("converts decimal day durations to hours (0,562 j → 4,5 h)", () => {
    const csv = `WBS;Type;Nom;Durée (j);Début;Fin
1;Groupement;Sprint;;13/07/2026;26/07/2026
1.1;Tâche;US-1901;0,562;;
1.2;Tâche;US-1904;0,75;;
1.3;Tâche;US-0101;0,375;;
1.4;Tâche;US longue;3;;`;
    const { tasks, errors } = parseImportRows(parseCsvText(csv), opts);
    expect(errors).toEqual([]);
    expect(tasks.find((t) => t.id.endsWith("1-1"))?.duration).toBe(0.562);
    expect(tasks.find((t) => t.id.endsWith("1-1"))?.custom?.durationHours).toBe(4.5);
    expect(tasks.find((t) => t.id.endsWith("1-2"))?.duration).toBe(0.75);
    expect(tasks.find((t) => t.id.endsWith("1-2"))?.custom?.durationHours).toBe(6);
    expect(tasks.find((t) => t.id.endsWith("1-3"))?.duration).toBe(0.375);
    expect(tasks.find((t) => t.id.endsWith("1-3"))?.custom?.durationHours).toBe(3);
    expect(tasks.find((t) => t.id.endsWith("1-4"))?.custom?.durationHours).toBe(24);
  });

  it("parseDurationDays treats decimals as days not weeks", () => {
    expect(parseDurationDays("0,562")).toBe(0.562);
    expect(daysToHours(0.562)).toBe(4.5);
  });

  it("chains tasks sequentially from groupement start with FS dependencies", () => {
    const csv = `WBS;Type;Nom;Durée (j);Début;Fin
1;Groupement;Sprint 1;;13/07/2026;
1.1;Tâche;US-A;1;;
1.2;Tâche;US-B;2;;
1.3;Jalon;Fin sprint;0;;
2;Groupement;Sprint 2;;27/07/2026;
2.1;Tâche;US-C;1;;`;
    const { tasks, dependencies } = parseImportRows(parseCsvText(csv), opts);
    expect(dependencies).toHaveLength(3);
    const schedule = computeSchedule({
      tasks,
      dependencies,
      calendar: DEFAULT_CALENDAR,
      projectStart: opts.projectStart,
    });
    const s1 = schedule.tasks.get("refonte-wbs-1-1")!;
    const s2 = schedule.tasks.get("refonte-wbs-1-2")!;
    const s3 = schedule.tasks.get("refonte-wbs-1-3")!;
    const s4 = schedule.tasks.get("refonte-wbs-2-1")!;
    expect(s1.startDate).toBe("2026-07-13");
    expect(s2.startDate).toBe("2026-07-14");
    expect(s3.startDate).toBe("2026-07-16");
    expect(s4.startDate).toBe("2026-07-27");
  });

  it("rejects groupement with duration", () => {
    const csv = `WBS;Type;Nom;Durée (j);Début;Fin
1;Groupement;Phase;5;;`;
    const { errors } = parseImportRows(parseCsvText(csv), opts);
    expect(errors.some((e) => e.message.includes("ne doit pas avoir de durée"))).toBe(true);
  });

  it("rejects duplicate WBS", () => {
    const csv = `WBS;Type;Nom;Durée (j);Début;Fin
1;Tâche;A;1;;
1;Tâche;B;1;;`;
    const { errors } = parseImportRows(parseCsvText(csv), opts);
    expect(errors.some((e) => e.message.includes("dupliqué"))).toBe(true);
  });
});
