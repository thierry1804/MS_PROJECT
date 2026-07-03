import { taskPlannedCost, type Resource, type ScheduleResult } from "@atelier/scheduling-engine";
import type { Project } from "./domain";

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Excel-friendly CSV (";" delimiter, UTF-8 BOM) of every task in a project. */
export function exportProjectCsv(project: Project, schedule: ScheduleResult, resources: Resource[]) {
  const rmap = new Map(resources.map((r) => [r.id, r]));
  const predsBySucc = new Map<string, string[]>();
  for (const d of project.dependencies) {
    const arr = predsBySucc.get(d.successorId) ?? [];
    arr.push(`${d.predecessorId}(${d.type}${d.lag ? (d.lag > 0 ? `+${d.lag}` : d.lag) : ""})`);
    predsBySucc.set(d.successorId, arr);
  }

  const headers = [
    "WBS",
    "Tâche",
    "Type",
    "Début",
    "Fin",
    "Durée (j)",
    "Avancement %",
    "Critique",
    "Marge (j)",
    "Ressources",
    "Coût planifié",
    "Coût réel",
    "Baseline début",
    "Baseline fin",
    "Prédécesseurs",
  ];

  const lines = [headers.map(csvCell).join(";")];
  for (const id of schedule.outline) {
    const t = project.tasks.find((x) => x.id === id);
    const s = schedule.tasks.get(id);
    if (!t || !s) continue;
    const type = s.isSummary ? "Récap" : s.isMilestone ? "Jalon" : "Tâche";
    const cost = s.isSummary ? "" : Math.round(taskPlannedCost(t, s.duration, rmap));
    const names = t.assignments
      .map((a) => rmap.get(a.resourceId)?.name ?? a.resourceId)
      .join(" / ");
    lines.push(
      [
        s.wbs,
        `${"  ".repeat(s.level)}${t.name}`,
        type,
        s.startDate,
        s.finishDate,
        s.duration,
        s.isSummary ? "" : t.percentComplete,
        s.critical ? "oui" : "",
        s.isSummary ? "" : s.slack,
        names,
        cost,
        s.isSummary || t.actualCost == null ? "" : Math.round(t.actualCost),
        t.baseline?.start ?? "",
        t.baseline?.finish ?? "",
        (predsBySucc.get(id) ?? []).join(" "),
      ]
        .map(csvCell)
        .join(";"),
    );
  }

  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  triggerDownload(`${project.code}-${project.name}.csv`.replace(/[\\/:*?"<>|]/g, "_"), blob);
}

/** Pretty-printed JSON download of any serializable value. */
export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  triggerDownload(filename, blob);
}
