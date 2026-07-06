import {
  type CalendarDef,
  type Dependency,
  type Task,
  type TaskConstraint,
} from "@atelier/scheduling-engine";
import { durationCustomFields, parseDurationDays } from "./duration";

export { parseDurationDays } from "./duration";

export type ImportRowType = "groupement" | "tache" | "jalon";

export interface ImportError {
  line: number;
  message: string;
}

export interface ImportResult {
  tasks: Task[];
  dependencies: Dependency[];
  errors: ImportError[];
}

export interface ParseImportOptions {
  projectId: string;
  calendar: CalendarDef;
  projectStart: string;
}

export const IMPORT_TEMPLATE = `WBS;Type;Nom;Durée (j);Début;Fin
1;Groupement;Phase 1 - Cadrage;;01/07/2026;15/07/2026
1.1;Tâche;Atelier besoins;3;;
1.2;Tâche;Rédaction cahier des charges;5;;
1.3;Jalon;Validation CDC;0;15/07/2026;
2;Groupement;Phase 2 - Conception;;;
2.1;Tâche;Maquettes UI;8;;
2.2;Tâche;Architecture technique;5;;
2.3;Jalon;Go conception;0;;`;

const HEADER_ALIASES: Record<string, string> = {
  wbs: "wbs",
  type: "type",
  nom: "nom",
  name: "nom",
  "durée (j)": "duration",
  "duree (j)": "duration",
  "durée": "duration",
  duree: "duration",
  début: "start",
  debut: "start",
  fin: "finish",
};

function normalizeHeader(cell: string): string {
  return HEADER_ALIASES[cell.trim().toLowerCase()] ?? cell.trim().toLowerCase();
}

function normalizeType(raw: string): ImportRowType | null {
  const t = raw.trim().toLowerCase();
  if (t === "groupement" || t === "récap" || t === "recap") return "groupement";
  if (t === "tâche" || t === "tache") return "tache";
  if (t === "jalon") return "jalon";
  return null;
}

/** Parse dd/mm/yyyy or yyyy-mm-dd into ISO yyyy-mm-dd. */
export function parseImportDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (slash) {
    const d = String(Number(slash[1])).padStart(2, "0");
    const m = String(Number(slash[2])).padStart(2, "0");
    return `${slash[3]}-${m}-${d}`;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return s;
  return null;
}

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${d}/${m}/${y}`;
  }
  return String(v).trim();
}

/** Semicolon-delimited CSV with optional UTF-8 BOM and Excel quoting. */
export function parseCsvText(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ";") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

function wbsParent(wbs: string): string | null {
  const dot = wbs.lastIndexOf(".");
  return dot === -1 ? null : wbs.slice(0, dot);
}

function wbsOrder(wbs: string): number {
  const last = wbs.split(".").pop()!;
  return Number(last) - 1;
}

function taskId(projectId: string, wbs: string): string {
  return `${projectId}-wbs-${wbs.replace(/\./g, "-")}`;
}

interface ParsedRow {
  line: number;
  wbs: string;
  type: ImportRowType;
  name: string;
  duration: number;
  start?: string;
  finish?: string;
}

function applyConstraint(task: Task, constraint: TaskConstraint): Task {
  return { ...task, constraint };
}

function collectLeaves(wbs: string, rows: ParsedRow[]): ParsedRow[] {
  const leaves: ParsedRow[] = [];
  for (const row of rows) {
    if (wbsParent(row.wbs) !== wbs) continue;
    if (row.type === "groupement") {
      leaves.push(...collectLeaves(row.wbs, rows));
    } else {
      leaves.push(row);
    }
  }
  return leaves;
}

/** Dépendances FS : enchaînement des feuilles dans chaque groupement + entre groupements frères. */
function buildImportDependencies(rows: ParsedRow[], projectId: string): Dependency[] {
  const deps: Dependency[] = [];
  const id = (wbs: string) => taskId(projectId, wbs);

  for (const row of rows) {
    if (row.type !== "groupement") continue;
    const leaves = collectLeaves(row.wbs, rows);
    for (let i = 0; i < leaves.length - 1; i++) {
      deps.push({
        predecessorId: id(leaves[i]!.wbs),
        successorId: id(leaves[i + 1]!.wbs),
        type: "FS",
        lag: 0,
      });
    }
  }

  const groupements = rows.filter((r) => r.type === "groupement");
  const byParent = new Map<string | null, ParsedRow[]>();
  for (const g of groupements) {
    const parent = wbsParent(g.wbs);
    const list = byParent.get(parent) ?? [];
    list.push(g);
    byParent.set(parent, list);
  }
  for (const siblings of byParent.values()) {
    for (let i = 0; i < siblings.length - 1; i++) {
      const prevLeaves = collectLeaves(siblings[i]!.wbs, rows);
      const nextLeaves = collectLeaves(siblings[i + 1]!.wbs, rows);
      if (prevLeaves.length === 0 || nextLeaves.length === 0) continue;
      deps.push({
        predecessorId: id(prevLeaves[prevLeaves.length - 1]!.wbs),
        successorId: id(nextLeaves[0]!.wbs),
        type: "FS",
        lag: 0,
      });
    }
  }

  return deps;
}

function propagateGroupConstraints(
  tasks: Task[],
  rows: ParsedRow[],
  opts: ParseImportOptions,
): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, { ...t }]));
  const wbsToTaskId = new Map(rows.map((r) => [r.wbs, taskId(opts.projectId, r.wbs)]));

  for (const row of rows) {
    if (row.type !== "groupement") continue;
    const leaves = collectLeaves(row.wbs, rows);
    if (leaves.length === 0) continue;

    if (row.start) {
      const first = leaves[0]!;
      const tid = wbsToTaskId.get(first.wbs)!;
      const t = byId.get(tid)!;
      byId.set(tid, applyConstraint(t, { type: "MSO", date: row.start }));
    }
  }

  for (const row of rows) {
    if (row.type !== "jalon" || !row.start) continue;
    const id = wbsToTaskId.get(row.wbs)!;
    const t = byId.get(id)!;
    byId.set(id, applyConstraint(t, { type: "MSO", date: row.start }));
  }

  return tasks.map((t) => byId.get(t.id) ?? t);
}

export function parseImportRows(rows: string[][], opts: ParseImportOptions): ImportResult {
  const errors: ImportError[] = [];
  if (rows.length === 0) {
    return { tasks: [], dependencies: [], errors: [{ line: 0, message: "Fichier vide" }] };
  }

  const headerRow = rows[0]!.map((c) => normalizeHeader(cellToString(c)));
  const col = (key: string) => headerRow.indexOf(key);
  const wbsCol = col("wbs");
  const typeCol = col("type");
  const nameCol = col("nom");

  if (wbsCol === -1 || typeCol === -1 || nameCol === -1) {
    return {
      tasks: [],
      dependencies: [],
      errors: [{ line: 1, message: "En-têtes requis manquants : WBS, Type, Nom" }],
    };
  }

  const durationCol = col("duration");
  const startCol = col("start");
  const finishCol = col("finish");

  const parsed: ParsedRow[] = [];
  const seenWbs = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const line = i + 1;
    const cells = rows[i]!;
    if (cells.every((c) => cellToString(c) === "")) continue;

    const wbs = cellToString(cells[wbsCol]!);
    const typeRaw = cellToString(cells[typeCol]!);
    const name = cellToString(cells[nameCol]!);
    const durationCell = durationCol >= 0 ? cells[durationCol] : null;
    const durationRaw = cellToString(durationCell ?? "");
    const startRaw = startCol >= 0 ? cellToString(cells[startCol]!) : "";
    const finishRaw = finishCol >= 0 ? cellToString(cells[finishCol]!) : "";

    if (!wbs) {
      errors.push({ line, message: "WBS manquant" });
      continue;
    }
    if (seenWbs.has(wbs)) {
      errors.push({ line, message: `WBS dupliqué : ${wbs}` });
      continue;
    }
    seenWbs.add(wbs);

    const type = normalizeType(typeRaw);
    if (!type) {
      errors.push({ line, message: `Type invalide : ${typeRaw}` });
      continue;
    }
    if (!name) {
      errors.push({ line, message: "Nom manquant" });
      continue;
    }

    let duration = 0;
    if (type === "tache") {
      const days = parseDurationDays(durationCell);
      if (days == null || days <= 0) {
        errors.push({
          line,
          message: "Durée obligatoire pour une tâche (jours ouvrés, décimaux acceptés ex. 0,562)",
        });
        continue;
      }
      duration = days;
    } else if (type === "jalon") {
      if (durationRaw === "") {
        duration = 0;
      } else {
        const days = parseDurationDays(durationCell);
        if (days !== 0) {
          errors.push({ line, message: "Durée d'un jalon doit être 0 ou vide" });
          continue;
        }
        duration = 0;
      }
    }

    if (type === "groupement" && durationRaw) {
      errors.push({ line, message: "Un groupement ne doit pas avoir de durée" });
      continue;
    }

    let start: string | undefined;
    let finish: string | undefined;

    if (startRaw) {
      const d = parseImportDate(startRaw);
      if (!d) {
        errors.push({ line, message: `Date de début invalide : ${startRaw}` });
        continue;
      }
      start = d;
    }
    if (finishRaw) {
      if (type !== "groupement") {
        errors.push({ line, message: "La colonne Fin est réservée aux groupements" });
        continue;
      }
      const d = parseImportDate(finishRaw);
      if (!d) {
        errors.push({ line, message: `Date de fin invalide : ${finishRaw}` });
        continue;
      }
      finish = d;
    }

    if (type === "tache" && startRaw) {
      errors.push({ line, message: "La colonne Début est ignorée pour les tâches (utiliser les groupements ou jalons)" });
      continue;
    }

    parsed.push({ line, wbs, type, name, duration, start, finish });
  }

  for (const row of parsed) {
    const parent = wbsParent(row.wbs);
    if (parent !== null && !seenWbs.has(parent)) {
      errors.push({ line: row.line, message: `Parent WBS introuvable : ${parent}` });
    }
    if (parent !== null) {
      const parentRow = parsed.find((r) => r.wbs === parent);
      if (parentRow?.type === "jalon") {
        errors.push({ line: row.line, message: "Impossible d'imbriquer sous un jalon" });
      }
    }
  }

  if (errors.length > 0) return { tasks: [], dependencies: [], errors };
  if (parsed.length === 0) {
    return { tasks: [], dependencies: [], errors: [{ line: 0, message: "Aucune ligne de tâche" }] };
  }

  const wbsToParentId = new Map<string, string | null>();
  for (const row of parsed) {
    const parent = wbsParent(row.wbs);
    wbsToParentId.set(
      row.wbs,
      parent === null ? null : taskId(opts.projectId, parent),
    );
  }

  let tasks: Task[] = parsed.map((row) => {
    const isLeaf = row.type === "tache" || row.type === "jalon";
    const duration = row.type === "groupement" ? 0 : row.duration;
    return {
      id: taskId(opts.projectId, row.wbs),
      name: row.name,
      parentId: wbsToParentId.get(row.wbs) ?? null,
      order: wbsOrder(row.wbs),
      duration,
      percentComplete: 0,
      assignments: [],
      ...(isLeaf && duration > 0 ? { custom: durationCustomFields(duration) } : {}),
    };
  });

  tasks = propagateGroupConstraints(tasks, parsed, opts);
  const dependencies = buildImportDependencies(parsed, opts.projectId);

  return { tasks, dependencies, errors: [] };
}
