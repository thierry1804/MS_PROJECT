import { setAuditActor, resetAuditActor } from "../sync";
import { executeQuery } from "./actions/query";
import {
  executeAddTask,
  executeAssignResource,
  executeAddDependency,
  executeCaptureBaseline,
  executeLogTime,
  executeShiftTasks,
  executeUpdateTask,
  executeAddResource,
  executeUpdateResource,
} from "./actions/planning";
import {
  executeAddDemand,
  executeConvertDemand,
  executeDeleteDemand,
  executeMoveDemand,
} from "./actions/pipeline";
import {
  executeCreateProject,
  executeDeleteProject,
  executeUpdateProject,
} from "./actions/project";
import { executeAddRaid, executeRemoveRaid, parseRaidKind } from "./actions/raid";
import { INTENT_REGISTRY } from "./intents";
import { isSlotEmpty } from "./slot-filler";
import type { CopilotIntentId, ExecuteResult, SlotDef } from "./types";
import type { CopilotStoreGetter } from "./store-bridge";

export function getMissingSlots(
  intent: CopilotIntentId,
  slots: Record<string, unknown>,
): SlotDef[] {
  const def = INTENT_REGISTRY[intent];
  const missing: SlotDef[] = [];

  if (intent === "updateTask") {
    if (isSlotEmpty(slots.projectId)) {
      missing.push({ key: "projectId", label: "Projet", type: "choice", required: true });
    }
    const hasTask =
      !isSlotEmpty(slots.taskId) ||
      (Array.isArray(slots.taskIds) && (slots.taskIds as unknown[]).length > 0);
    if (!hasTask) {
      missing.push({ key: "taskId", label: "Tâche", type: "choice", required: true });
    }
    const hasPatch =
      !isSlotEmpty(slots.name) ||
      slots.duration !== undefined ||
      slots.percentComplete !== undefined;
    if (!hasPatch) {
      missing.push({ key: "percentComplete", label: "Avancement %", type: "number", required: true });
    }
    return missing;
  }

  for (const s of def.slots) {
    if (!s.required) continue;
    if (intent === "moveDemand") {
      const stage = String(slots.stage ?? "");
      if (s.key === "approver" && (stage === "qualifiee" || stage === "approuvee")) {
        if (isSlotEmpty(slots.approver)) missing.push({ ...s, required: true });
        continue;
      }
      if (s.key === "criteria" && (stage === "qualifiee" || stage === "approuvee")) {
        const criteria = slots.criteria;
        if (!Array.isArray(criteria) || criteria.length === 0) missing.push({ ...s, required: true });
        continue;
      }
    }
    if (isSlotEmpty(slots[s.key])) missing.push(s);
  }
  return missing;
}

export interface ExecuteOptions {
  source?: "copilot" | "ui";
}

export function executeAction(
  getStore: CopilotStoreGetter,
  intent: CopilotIntentId,
  slots: Record<string, unknown>,
  options: ExecuteOptions = {},
): ExecuteResult {
  const def = INTENT_REGISTRY[intent];
  const missing = getMissingSlots(intent, slots);
  if (missing.length > 0) {
    return { type: "error", message: `Informations manquantes : ${missing.map((m) => m.label).join(", ")}` };
  }

  if (def.category === "query") {
    const store = getStore();
    return { type: "query", markdown: executeQuery(intent, store.portfolio, slots) };
  }

  const fromCopilot = options.source === "copilot";
  if (fromCopilot) setAuditActor("copilot");

  try {
    const store = getStore();
    switch (intent) {
      case "createProject": {
        const id = executeCreateProject(store, slots);
        return { type: "mutation", entityId: id, message: "Projet créé." };
      }
      case "updateProject":
        executeUpdateProject(store, slots);
        return { type: "mutation", message: "Projet mis à jour." };
      case "deleteProject":
        executeDeleteProject(store, slots);
        return { type: "mutation", message: "Projet supprimé." };
      case "addRisk":
        executeAddRaid(store, "risks", slots);
        return { type: "mutation", message: "Risque enregistré." };
      case "addAction":
        executeAddRaid(store, "actions", slots);
        return { type: "mutation", message: "Action enregistrée." };
      case "addIssue":
        executeAddRaid(store, "issues", slots);
        return { type: "mutation", message: "Problème enregistré." };
      case "addDecision":
        executeAddRaid(store, "decisions", slots);
        return { type: "mutation", message: "Décision enregistrée." };
      case "removeRaidItem":
        executeRemoveRaid(store, slots);
        return { type: "mutation", message: "Élément RAID supprimé." };
      case "addDemand":
        executeAddDemand(store, slots);
        return { type: "mutation", message: "Demande créée." };
      case "moveDemand":
        executeMoveDemand(store, slots);
        return { type: "mutation", message: "Demande avancée." };
      case "convertDemand": {
        const id = executeConvertDemand(store, slots);
        return { type: "mutation", entityId: id ?? undefined, message: id ? "Projet créé depuis la demande." : "Demande déjà convertie." };
      }
      case "deleteDemand":
        executeDeleteDemand(store, slots);
        return { type: "mutation", message: "Demande supprimée." };
      case "addTask":
        executeAddTask(store, store.portfolio, slots);
        return { type: "mutation", message: "Tâche ajoutée." };
      case "updateTask": {
        const n = executeUpdateTask(store, slots);
        return {
          type: "mutation",
          message: n > 1 ? `${n} tâches mises à jour.` : "Tâche mise à jour.",
        };
      }
      case "addDependency":
        executeAddDependency(store, slots);
        return { type: "mutation", message: "Dépendance ajoutée." };
      case "assignResource":
        executeAssignResource(store, slots);
        return { type: "mutation", message: "Ressource affectée." };
      case "captureBaseline":
        executeCaptureBaseline(store, slots);
        return { type: "mutation", message: "Baseline capturée." };
      case "shiftTasks":
        executeShiftTasks(store, slots);
        return { type: "mutation", message: "Tâche décalée." };
      case "logTime":
        executeLogTime(store, slots);
        return { type: "mutation", message: "Temps saisi." };
      case "addResource":
        executeAddResource(store, slots);
        return { type: "mutation", message: "Ressource ajoutée." };
      case "updateResource":
        executeUpdateResource(store, slots);
        return { type: "mutation", message: "Ressource mise à jour." };
      default:
        return { type: "error", message: `Intent « ${intent} » non implémenté.` };
    }
  } catch (e) {
    return { type: "error", message: e instanceof Error ? e.message : "Erreur d'exécution." };
  } finally {
    if (fromCopilot) resetAuditActor();
  }
}

export { parseRaidKind };
