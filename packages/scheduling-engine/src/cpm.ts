import type {
  CalendarDef,
  Dependency,
  ScheduleError,
  ScheduleResult,
  ScheduledTask,
  Task,
} from "./types";
import { dateToIndex, indexToDate } from "./calendar";

interface OutlineNode {
  task: Task;
  children: OutlineNode[];
  wbs: string;
  level: number;
}

function buildOutline(tasks: Task[]): { roots: OutlineNode[]; order: string[]; byId: Map<string, OutlineNode> } {
  const byParent = new Map<string | null, Task[]>();
  for (const t of tasks) {
    const list = byParent.get(t.parentId) ?? [];
    list.push(t);
    byParent.set(t.parentId, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.order - b.order);

  const byId = new Map<string, OutlineNode>();
  const order: string[] = [];

  function walk(parentId: string | null, prefix: string, level: number): OutlineNode[] {
    const children = byParent.get(parentId) ?? [];
    return children.map((t, i) => {
      const wbs = prefix === "" ? String(i + 1) : `${prefix}.${i + 1}`;
      const node: OutlineNode = { task: t, wbs, level, children: [] };
      byId.set(t.id, node);
      order.push(t.id);
      node.children = walk(t.id, wbs, level + 1);
      return node;
    });
  }

  const roots = walk(null, "", 0);
  return { roots, order, byId };
}

function leafDescendants(node: OutlineNode): Task[] {
  if (node.children.length === 0) return [node.task];
  return node.children.flatMap(leafDescendants);
}

/** Expand dependencies that reference summary tasks into leaf-to-leaf dependencies. */
function expandDependencies(
  deps: Dependency[],
  byId: Map<string, OutlineNode>,
  errors: ScheduleError[],
): Dependency[] {
  const out: Dependency[] = [];
  for (const dep of deps) {
    const pred = byId.get(dep.predecessorId);
    const succ = byId.get(dep.successorId);
    if (!pred || !succ) {
      errors.push({
        kind: "missing-task",
        message: `Dependency references unknown task`,
        taskIds: [dep.predecessorId, dep.successorId],
      });
      continue;
    }
    for (const p of leafDescendants(pred)) {
      for (const s of leafDescendants(succ)) {
        if (p.id !== s.id) out.push({ ...dep, predecessorId: p.id, successorId: s.id });
      }
    }
  }
  return out;
}

/** Kahn topological sort. Returns null when a cycle exists. */
function topoSort(leafIds: string[], deps: Dependency[]): string[] | null {
  const indegree = new Map<string, number>(leafIds.map((id) => [id, 0]));
  const successors = new Map<string, string[]>();
  for (const d of deps) {
    indegree.set(d.successorId, (indegree.get(d.successorId) ?? 0) + 1);
    const list = successors.get(d.predecessorId) ?? [];
    list.push(d.successorId);
    successors.set(d.predecessorId, list);
  }
  const queue = leafIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  const sorted: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    for (const s of successors.get(id) ?? []) {
      const n = indegree.get(s)! - 1;
      indegree.set(s, n);
      if (n === 0) queue.push(s);
    }
  }
  return sorted.length === leafIds.length ? sorted : null;
}

export interface ScheduleInput {
  tasks: Task[];
  dependencies: Dependency[];
  calendar: CalendarDef;
  /** ISO project start date. */
  projectStart: string;
}

export function computeSchedule(input: ScheduleInput): ScheduleResult {
  const { tasks, calendar, projectStart } = input;
  const errors: ScheduleError[] = [];
  const { order, byId } = buildOutline(tasks);

  const leaves = order.filter((id) => byId.get(id)!.children.length === 0);
  const deps = expandDependencies(input.dependencies, byId, errors);

  const sorted = topoSort(leaves, deps);
  if (!sorted) {
    errors.push({ kind: "cycle", message: "Dependency cycle detected", taskIds: [] });
    return {
      tasks: new Map(),
      projectDuration: 0,
      projectFinishDate: projectStart,
      outline: order,
      errors,
    };
  }

  const predsOf = new Map<string, Dependency[]>();
  const succsOf = new Map<string, Dependency[]>();
  for (const d of deps) {
    (predsOf.get(d.successorId) ?? predsOf.set(d.successorId, []).get(d.successorId)!).push(d);
    (succsOf.get(d.predecessorId) ?? succsOf.set(d.predecessorId, []).get(d.predecessorId)!).push(d);
  }

  const es = new Map<string, number>();
  const ef = new Map<string, number>();

  // Forward pass over leaves.
  for (const id of sorted) {
    const task = byId.get(id)!.task;
    const dur = Math.max(0, task.duration);
    let start = 0;

    for (const d of predsOf.get(id) ?? []) {
      const pEs = es.get(d.predecessorId)!;
      const pEf = ef.get(d.predecessorId)!;
      let bound: number;
      switch (d.type) {
        case "FS": bound = pEf + d.lag; break;
        case "SS": bound = pEs + d.lag; break;
        case "FF": bound = pEf + d.lag - dur; break;
        case "SF": bound = pEs + d.lag - dur; break;
      }
      start = Math.max(start, bound);
    }

    const c = task.constraint;
    if (c && (c.type === "SNET" || c.type === "MSO")) {
      if (!c.date) {
        errors.push({ kind: "bad-constraint", message: `${task.name}: constraint without date`, taskIds: [id] });
      } else {
        const idx = dateToIndex(calendar, projectStart, c.date);
        start = c.type === "MSO" ? idx : Math.max(start, idx);
      }
    }

    es.set(id, start);
    ef.set(id, start + dur);
  }

  const projectDuration = Math.max(0, ...leaves.map((id) => ef.get(id)!));

  // Backward pass in reverse topological order.
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  for (const id of [...sorted].reverse()) {
    const task = byId.get(id)!.task;
    const dur = Math.max(0, task.duration);
    let finish = projectDuration;

    for (const d of succsOf.get(id) ?? []) {
      const sLs = ls.get(d.successorId)!;
      const sLf = lf.get(d.successorId)!;
      let bound: number;
      switch (d.type) {
        case "FS": bound = sLs - d.lag; break;
        case "SS": bound = sLs - d.lag + dur; break;
        case "FF": bound = sLf - d.lag; break;
        case "SF": bound = sLf - d.lag + dur; break;
      }
      finish = Math.min(finish, bound);
    }

    if (task.constraint?.type === "MSO" && task.constraint.date) {
      finish = Math.min(finish, es.get(id)! + dur);
    }

    lf.set(id, finish);
    ls.set(id, finish - dur);
  }

  // Assemble results, rolling summaries up from leaves (reverse outline order: children first).
  const result = new Map<string, ScheduledTask>();
  for (const id of [...order].reverse()) {
    const node = byId.get(id)!;
    const task = node.task;
    const isSummary = node.children.length > 0;

    let tEs: number, tEf: number, tLs: number, tLf: number, critical: boolean;
    if (isSummary) {
      const kids = node.children.map((c) => result.get(c.task.id)!);
      tEs = Math.min(...kids.map((k) => k.es));
      tEf = Math.max(...kids.map((k) => k.ef));
      tLs = Math.min(...kids.map((k) => k.ls));
      tLf = Math.max(...kids.map((k) => k.lf));
      critical = kids.some((k) => k.critical);
    } else {
      tEs = es.get(id)!;
      tEf = ef.get(id)!;
      tLs = ls.get(id)!;
      tLf = lf.get(id)!;
      critical = tLs - tEs <= 0;
    }

    const duration = tEf - tEs;
    const isMilestone = !isSummary && task.duration === 0;
    result.set(id, {
      id,
      es: tEs,
      ef: tEf,
      ls: tLs,
      lf: tLf,
      slack: tLs - tEs,
      critical,
      isSummary,
      isMilestone,
      duration,
      startDate: indexToDate(calendar, projectStart, tEs),
      // Inclusive finish: last working day the task occupies.
      finishDate: indexToDate(calendar, projectStart, isMilestone ? tEs : Math.max(tEs, tEf - 1)),
      wbs: node.wbs,
      level: node.level,
    });
  }

  return {
    tasks: result,
    projectDuration,
    projectFinishDate: indexToDate(calendar, projectStart, Math.max(0, projectDuration - 1)),
    outline: order,
    errors,
  };
}
