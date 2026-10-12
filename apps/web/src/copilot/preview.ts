import type { Portfolio } from "../domain";
import { DEMAND_STAGE_LABELS } from "../domain";
import { INTENT_REGISTRY } from "./intents";
import { buildPlanningImpactPreview } from "./actions/planning";
import type { ActionPreview, CopilotIntentId } from "./types";

function projectLabel(portfolio: Portfolio, projectId: string): string {
  const p = portfolio.projects.find((x) => x.id === projectId);
  return p ? `${p.name} (${p.code})` : projectId;
}

function demandLabel(portfolio: Portfolio, demandId: string): string {
  const d = (portfolio.demands ?? []).find((x) => x.id === demandId);
  return d ? d.title : demandId;
}

export function buildPreview(
  intent: CopilotIntentId,
  slots: Record<string, unknown>,
  portfolio?: Portfolio,
): ActionPreview {
  const def = INTENT_REGISTRY[intent];
  const destructive = Boolean(def.destructive);
  const requiresConfirmation = def.category !== "query" || destructive;

  const details: string[] = [];
  let summary = def.label;

  switch (intent) {
    case "createProject":
      summary = `Créer le projet « ${slots.name} »`;
      details.push(`Chef : ${slots.manager ?? "—"}`);
      details.push(`Budget : ${Number(slots.budget ?? 0).toLocaleString("fr-FR")} €`);
      break;
    case "deleteProject":
      summary = portfolio
        ? `Supprimer le projet ${projectLabel(portfolio, String(slots.projectId))}`
        : "Supprimer le projet";
      break;
    case "addRisk":
      summary = `Ajouter le risque « ${slots.label} »`;
      if (portfolio) details.push(`Projet : ${projectLabel(portfolio, String(slots.projectId))}`);
      details.push(`Score : ${Number(slots.probability ?? 3) * Number(slots.impact ?? 3)}`);
      break;
    case "moveDemand":
      summary = portfolio
        ? `Avancer « ${demandLabel(portfolio, String(slots.demandId))} » vers ${DEMAND_STAGE_LABELS[String(slots.stage) as keyof typeof DEMAND_STAGE_LABELS] ?? slots.stage}`
        : "Avancer la demande";
      if (slots.approver) details.push(`Approbateur : ${slots.approver}`);
      break;
    case "convertDemand":
      summary = portfolio
        ? `Convertir « ${demandLabel(portfolio, String(slots.demandId))} » en projet`
        : "Convertir la demande";
      break;
    case "captureBaseline":
      summary = portfolio
        ? `Capturer la baseline — ${projectLabel(portfolio, String(slots.projectId))}`
        : "Capturer la baseline";
      break;
    case "updateTask":
      if (portfolio) {
        const project = portfolio.projects.find((p) => p.id === slots.projectId);
        const ids = Array.isArray(slots.taskIds)
          ? (slots.taskIds as string[])
          : slots.taskId
            ? [String(slots.taskId)]
            : [];
        const names = ids
          .map((id) => project?.tasks.find((t) => t.id === id)?.name ?? id)
          .slice(0, 3);
        summary =
          names.length > 1
            ? `Mettre à jour ${names.length} tâches à ${slots.percentComplete ?? "—"} %`
            : names.length === 1
              ? `Mettre à jour « ${names[0]} » à ${slots.percentComplete ?? "—"} %`
              : "Modifier une tâche";
        if (project) details.push(`Projet : ${project.name} (${project.code})`);
      }
      break;
    case "shiftTasks":
      if (portfolio) {
        const project = portfolio.projects.find((p) => p.id === slots.projectId);
        const task = project?.tasks.find((t) => t.id === slots.taskId);
        summary = task
          ? `Décaler « ${task.name} » de ${slots.shiftDays} j`
          : `Décaler la tâche de ${slots.shiftDays} j`;
        if (project) {
          const impact = buildPlanningImpactPreview(
            project,
            portfolio,
            String(slots.taskId),
            Number(slots.shiftDays) || 0,
          );
          if (impact.affectedTaskCount > 0) {
            details.push(`${impact.affectedTaskCount} tâche(s) impactée(s) en aval`);
          }
        }
      }
      break;
    default:
      if (def.category === "query") {
        summary = `Consultation : ${def.label}`;
        return { intent, summary, details, requiresConfirmation: false };
      }
      break;
  }

  return {
    intent,
    summary,
    details,
    requiresConfirmation: def.category === "query" ? false : true,
    destructive,
  };
}
